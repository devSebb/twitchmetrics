import { z } from "zod";
import { Platform, SnapshotTier } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../middleware";
import { router } from "../root";

export const adminRouter = router({
  getClaimQueue: adminProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "approved", "rejected", "expired"])
          .default("pending"),
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const [items, total] = await Promise.all([
        ctx.prisma.claimRequest.findMany({
          where: { status: input.status },
          include: {
            creatorProfile: {
              select: {
                id: true,
                displayName: true,
                slug: true,
                avatarUrl: true,
                totalFollowers: true,
                primaryPlatform: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: input.status === "pending" ? "asc" : "desc" },
          skip,
          take: input.limit,
        }),
        ctx.prisma.claimRequest.count({
          where: { status: input.status },
        }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        hasMore: skip + items.length < total,
      };
    }),

  getCreatorList: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        state: z
          .enum(["unclaimed", "pending_claim", "claimed", "premium"])
          .optional(),
        tier: z.nativeEnum(SnapshotTier).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const where: Record<string, unknown> = {};
      if (input.state) where.state = input.state;
      if (input.tier) where.snapshotTier = input.tier;
      if (input.search) {
        where.OR = [
          { displayName: { contains: input.search, mode: "insensitive" } },
          { slug: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const [items, total] = await Promise.all([
        ctx.prisma.creatorProfile.findMany({
          where,
          select: {
            id: true,
            displayName: true,
            slug: true,
            avatarUrl: true,
            state: true,
            snapshotTier: true,
            primaryPlatform: true,
            totalFollowers: true,
            totalViews: true,
            lastSnapshotAt: true,
            createdAt: true,
            userId: true,
          },
          orderBy: { totalFollowers: "desc" },
          skip,
          take: input.limit,
        }),
        ctx.prisma.creatorProfile.count({ where }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        hasMore: skip + items.length < total,
      };
    }),

  updateSnapshotTier: adminProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        tier: z.nativeEnum(SnapshotTier),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { id: input.creatorProfileId },
        select: { id: true, snapshotTier: true },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator profile not found.",
        });
      }

      return ctx.prisma.creatorProfile.update({
        where: { id: input.creatorProfileId },
        data: { snapshotTier: input.tier },
        select: {
          id: true,
          displayName: true,
          snapshotTier: true,
          updatedAt: true,
        },
      });
    }),

  bulkImport: adminProcedure
    .input(
      z.object({
        creators: z
          .array(
            z.object({
              displayName: z.string().trim().min(1).max(100),
              slug: z.string().trim().min(1).max(100),
              primaryPlatform: z.nativeEnum(Platform),
              platformUsername: z.string().trim().min(1),
              platformUserId: z.string().trim().min(1),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        slug: string;
        status: "created" | "skipped";
        reason?: string;
      }> = [];

      for (const creator of input.creators) {
        // Check for existing profile by slug
        const existingBySlug = await ctx.prisma.creatorProfile.findUnique({
          where: { slug: creator.slug },
          select: { id: true },
        });

        if (existingBySlug) {
          results.push({
            slug: creator.slug,
            status: "skipped",
            reason: "Slug already exists",
          });
          continue;
        }

        // Check for existing platform account
        const existingAccount = await ctx.prisma.platformAccount.findUnique({
          where: {
            platform_platformUserId: {
              platform: creator.primaryPlatform,
              platformUserId: creator.platformUserId,
            },
          },
          select: { id: true },
        });

        if (existingAccount) {
          results.push({
            slug: creator.slug,
            status: "skipped",
            reason: "Platform account already linked",
          });
          continue;
        }

        await ctx.prisma.creatorProfile.create({
          data: {
            displayName: creator.displayName,
            slug: creator.slug,
            primaryPlatform: creator.primaryPlatform,
            searchText:
              `${creator.displayName} ${creator.platformUsername}`.toLowerCase(),
            platformAccounts: {
              create: {
                platform: creator.primaryPlatform,
                platformUserId: creator.platformUserId,
                platformUsername: creator.platformUsername,
                platformDisplayName: creator.displayName,
                platformUrl: `https://${creator.primaryPlatform === "x" ? "x.com" : `${creator.primaryPlatform}.tv`}/${creator.platformUsername}`,
              },
            },
          },
        });

        results.push({ slug: creator.slug, status: "created" });
      }

      return {
        total: input.creators.length,
        created: results.filter((r) => r.status === "created").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        results,
      };
    }),
});
