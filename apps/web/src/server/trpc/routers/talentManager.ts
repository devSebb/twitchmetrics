import { z } from "zod";
import { Platform } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { talentManagerProcedure } from "../middleware";
import { router } from "../root";

export const talentManagerRouter = router({
  getRoster: talentManagerProcedure.query(async ({ ctx }) => {
    const access = await ctx.prisma.talentManagerAccess.findMany({
      where: {
        managerId: ctx.user.id,
        revokedAt: null,
      },
      include: {
        creatorProfile: {
          select: {
            id: true,
            displayName: true,
            slug: true,
            avatarUrl: true,
            primaryPlatform: true,
            totalFollowers: true,
            totalViews: true,
            state: true,
            lastSnapshotAt: true,
            platformAccounts: {
              select: {
                platform: true,
                platformUsername: true,
                followerCount: true,
              },
            },
            growthRollups: {
              select: {
                platform: true,
                delta7d: true,
                pct7d: true,
                trendDirection: true,
              },
            },
          },
        },
      },
      orderBy: { grantedAt: "desc" },
    });

    return access.map((a) => ({
      accessId: a.id,
      permissions: {
        canViewAnalytics: a.canViewAnalytics,
        canEditProfile: a.canEditProfile,
        canExportData: a.canExportData,
        canManageBrands: a.canManageBrands,
      },
      grantedAt: a.grantedAt,
      creator: a.creatorProfile,
    }));
  }),

  addCreator: talentManagerProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        permissions: z
          .object({
            canViewAnalytics: z.boolean().default(true),
            canEditProfile: z.boolean().default(false),
            canExportData: z.boolean().default(false),
            canManageBrands: z.boolean().default(false),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { id: input.creatorProfileId },
        select: { id: true, userId: true, state: true },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator profile not found.",
        });
      }

      if (profile.state !== "claimed" && profile.state !== "premium") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only manage claimed creator profiles.",
        });
      }

      // Check for existing active access
      const existing = await ctx.prisma.talentManagerAccess.findUnique({
        where: {
          managerId_creatorProfileId: {
            managerId: ctx.user.id,
            creatorProfileId: input.creatorProfileId,
          },
        },
      });

      if (existing && !existing.revokedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have access to this creator.",
        });
      }

      // If previously revoked, reactivate; otherwise create new
      if (existing) {
        return ctx.prisma.talentManagerAccess.update({
          where: { id: existing.id },
          data: {
            revokedAt: null,
            grantedAt: new Date(),
            grantedBy: ctx.user.id,
            ...(input.permissions ?? {}),
          },
        });
      }

      return ctx.prisma.talentManagerAccess.create({
        data: {
          managerId: ctx.user.id,
          creatorProfileId: input.creatorProfileId,
          grantedBy: ctx.user.id,
          ...(input.permissions ?? {}),
        },
      });
    }),

  removeCreator: talentManagerProcedure
    .input(z.object({ creatorProfileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const access = await ctx.prisma.talentManagerAccess.findUnique({
        where: {
          managerId_creatorProfileId: {
            managerId: ctx.user.id,
            creatorProfileId: input.creatorProfileId,
          },
        },
      });

      if (!access || access.revokedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active access to this creator.",
        });
      }

      await ctx.prisma.talentManagerAccess.update({
        where: { id: access.id },
        data: { revokedAt: new Date() },
      });

      return { success: true };
    }),

  getCreatorAnalytics: talentManagerProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        platform: z.nativeEnum(Platform).optional(),
        periodDays: z.number().int().min(7).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify manager has analytics access to this creator
      const access = await ctx.prisma.talentManagerAccess.findUnique({
        where: {
          managerId_creatorProfileId: {
            managerId: ctx.user.id,
            creatorProfileId: input.creatorProfileId,
          },
        },
      });

      if (!access || access.revokedAt || !access.canViewAnalytics) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No analytics access to this creator.",
        });
      }

      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.periodDays);

      return ctx.prisma.creatorAnalytics.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          ...(input.platform ? { platform: input.platform } : {}),
          periodStart: { gte: since },
        },
        orderBy: { periodStart: "desc" },
      });
    }),
});
