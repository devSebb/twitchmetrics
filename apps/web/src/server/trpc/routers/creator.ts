import { z } from "zod";
import { Platform } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, creatorProcedure } from "../middleware";
import { publicProcedure, router } from "../root";
import { WIDGET_REGISTRY } from "@/lib/constants/widgets";

export const creatorRouter = router({
  getProfile: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { slug: input.slug },
        include: {
          platformAccounts: {
            select: {
              id: true,
              platform: true,
              platformUsername: true,
              platformDisplayName: true,
              platformUrl: true,
              platformAvatarUrl: true,
              followerCount: true,
              totalViews: true,
              lastSyncedAt: true,
            },
          },
          growthRollups: {
            select: {
              platform: true,
              followerCount: true,
              delta1d: true,
              delta7d: true,
              delta30d: true,
              pct1d: true,
              pct7d: true,
              pct30d: true,
              trendDirection: true,
              acceleration: true,
              computedAt: true,
            },
          },
          brandPartnerships: {
            where: { isPublic: true },
            select: {
              id: true,
              brandName: true,
              brandLogoUrl: true,
              campaignName: true,
              startDate: true,
              endDate: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator not found.",
        });
      }

      return profile;
    }),

  updateProfile: creatorProcedure
    .input(
      z.object({
        bio: z.string().max(500).optional(),
        country: z.string().max(100).optional(),
        displayName: z.string().trim().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { userId: ctx.user.id },
        select: { id: true, state: true },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You have no claimed creator profile.",
        });
      }

      if (profile.state !== "claimed" && profile.state !== "premium") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Profile must be claimed to edit.",
        });
      }

      const data: Record<string, unknown> = {};
      if (input.bio !== undefined) data.bio = input.bio;
      if (input.country !== undefined) data.country = input.country;
      if (input.displayName !== undefined) data.displayName = input.displayName;

      return ctx.prisma.creatorProfile.update({
        where: { id: profile.id },
        data,
        select: {
          id: true,
          displayName: true,
          bio: true,
          country: true,
          updatedAt: true,
        },
      });
    }),

  getAnalytics: creatorProcedure
    .input(
      z.object({
        platform: z.nativeEnum(Platform).optional(),
        periodDays: z.number().int().min(7).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { userId: ctx.user.id },
        select: { id: true, state: true },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No claimed creator profile found.",
        });
      }

      if (profile.state !== "claimed" && profile.state !== "premium") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Analytics require a claimed profile.",
        });
      }

      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.periodDays);

      return ctx.prisma.creatorAnalytics.findMany({
        where: {
          creatorProfileId: profile.id,
          ...(input.platform ? { platform: input.platform } : {}),
          periodStart: { gte: since },
        },
        orderBy: { periodStart: "desc" },
      });
    }),

  updateWidgetConfig: creatorProcedure
    .input(
      z.object({
        widgetConfig: z.array(z.string()).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { userId: ctx.user.id },
        select: { id: true, state: true },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No creator profile found.",
        });
      }

      if (profile.state !== "claimed" && profile.state !== "premium") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Profile must be claimed to edit widget config.",
        });
      }

      const validIds = new Set(Object.keys(WIDGET_REGISTRY));
      const validated = input.widgetConfig.filter((id) => validIds.has(id));

      return ctx.prisma.creatorProfile.update({
        where: { id: profile.id },
        data: { widgetConfig: validated },
        select: { widgetConfig: true },
      });
    }),

  addBrandPartnership: creatorProcedure
    .input(
      z.object({
        brandName: z.string().trim().min(1).max(100),
        brandLogoUrl: z.string().url().optional().or(z.literal("")),
        campaignName: z.string().max(200).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { userId: ctx.user.id },
        select: {
          id: true,
          state: true,
          _count: { select: { brandPartnerships: true } },
        },
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (profile.state !== "claimed" && profile.state !== "premium") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (profile._count.brandPartnerships >= 12) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum 12 brand partners.",
        });
      }

      return ctx.prisma.brandPartnership.create({
        data: {
          creatorProfileId: profile.id,
          brandName: input.brandName,
          brandLogoUrl: input.brandLogoUrl || null,
          campaignName: input.campaignName || null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
        },
      });
    }),

  removeBrandPartnership: creatorProcedure
    .input(z.object({ partnershipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { userId: ctx.user.id },
        select: { id: true },
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify ownership
      const partnership = await ctx.prisma.brandPartnership.findUnique({
        where: { id: input.partnershipId },
        select: { creatorProfileId: true },
      });

      if (!partnership || partnership.creatorProfileId !== profile.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.prisma.brandPartnership.delete({
        where: { id: input.partnershipId },
      });
    }),

  generateMediaKit: creatorProcedure.query(async ({ ctx }) => {
    const profile = await ctx.prisma.creatorProfile.findUnique({
      where: { userId: ctx.user.id },
      include: {
        platformAccounts: {
          select: {
            platform: true,
            platformUsername: true,
            followerCount: true,
            totalViews: true,
          },
        },
        growthRollups: {
          select: {
            platform: true,
            followerCount: true,
            delta30d: true,
            pct30d: true,
            trendDirection: true,
          },
        },
        brandPartnerships: {
          where: { isPublic: true },
          select: {
            brandName: true,
            brandLogoUrl: true,
            campaignName: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!profile) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No claimed creator profile found.",
      });
    }

    if (profile.state !== "claimed" && profile.state !== "premium") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Media kit requires a claimed profile.",
      });
    }

    return {
      displayName: profile.displayName,
      slug: profile.slug,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      country: profile.country,
      totalFollowers: profile.totalFollowers,
      totalViews: profile.totalViews,
      platforms: profile.platformAccounts,
      growth: profile.growthRollups,
      partnerships: profile.brandPartnerships,
    };
  }),
});
