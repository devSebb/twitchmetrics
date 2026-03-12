import { z } from "zod";
import { Platform, Prisma } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../root";
import { adminProcedure } from "../middleware";
import { getTierForCreator } from "@/lib/constants/tiers";

export const snapshotRouter = router({
  getGrowthData: publicProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        platform: z.nativeEnum(Platform),
        period: z.enum(["7d", "30d", "90d", "1y", "all"]).default("30d"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const periodMap: Record<string, number | null> = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
        "1y": 365,
        all: null,
      };
      const days = periodMap[input.period];

      const since = days
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        : undefined;

      const snapshots = await ctx.prisma.metricSnapshot.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          platform: input.platform,
          ...(since ? { snapshotAt: { gte: since } } : {}),
        },
        select: {
          snapshotAt: true,
          followerCount: true,
          followingCount: true,
          totalViews: true,
          subscriberCount: true,
          postCount: true,
          extendedMetrics: true,
        },
        orderBy: { snapshotAt: "asc" },
      });

      return snapshots;
    }),

  getLatestMetrics: publicProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        platform: z.nativeEnum(Platform).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        creatorProfileId: input.creatorProfileId,
        ...(input.platform ? { platform: input.platform } : {}),
      };

      const latest = await ctx.prisma.metricSnapshot.findFirst({
        where,
        orderBy: { snapshotAt: "desc" },
      });

      if (!latest) return null;

      const rollup = await ctx.prisma.creatorGrowthRollup.findFirst({
        where: {
          creatorProfileId: input.creatorProfileId,
          ...(input.platform ? { platform: input.platform } : {}),
        },
      });

      return { snapshot: latest, growth: rollup };
    }),

  getPopularGames: publicProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        limit: z.number().int().min(1).max(12).default(6),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Aggregate most-streamed games from MetricSnapshot extendedMetrics
      const snapshots = await ctx.prisma.metricSnapshot.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          extendedMetrics: { not: Prisma.DbNull },
        },
        select: { extendedMetrics: true },
        orderBy: { snapshotAt: "desc" },
        take: 500,
      });

      // Aggregate game occurrences and avg viewers
      const gameMap = new Map<
        string,
        { count: number; totalViewers: number }
      >();

      for (const snap of snapshots) {
        const ext = snap.extendedMetrics as Record<string, unknown> | null;
        if (!ext) continue;
        const gameName =
          typeof ext.currentGame === "string" ? ext.currentGame : null;
        if (!gameName) continue;

        const viewers = typeof ext.avgViewers === "number" ? ext.avgViewers : 0;

        const existing = gameMap.get(gameName);
        if (existing) {
          existing.count += 1;
          existing.totalViewers += viewers;
        } else {
          gameMap.set(gameName, { count: 1, totalViewers: viewers });
        }
      }

      // Sort by count and limit
      const sorted = [...gameMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, input.limit);

      // Look up Game table slugs and cover images
      const gameNames = sorted.map(([name]) => name);
      const games = await ctx.prisma.game.findMany({
        where: { name: { in: gameNames } },
        select: { name: true, slug: true, coverImageUrl: true },
      });

      const gameInfoMap = new Map(games.map((g) => [g.name, g]));

      return sorted.map(([name, { count, totalViewers }]) => {
        const gameInfo = gameInfoMap.get(name);
        return {
          gameName: name,
          streamCount: count,
          avgViewers: Math.round(totalViewers / count),
          slug: gameInfo?.slug ?? null,
          coverImageUrl: gameInfo?.coverImageUrl ?? null,
        };
      });
    }),

  triggerManualSnapshot: adminProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        platform: z.nativeEnum(Platform),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { id: input.creatorProfileId },
        select: {
          id: true,
          totalFollowers: true,
          snapshotTier: true,
          platformAccounts: {
            where: { platform: input.platform },
            select: {
              id: true,
              platformUserId: true,
              isOAuthConnected: true,
              accessToken: true,
            },
          },
        },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator profile not found.",
        });
      }

      const account = profile.platformAccounts[0];
      if (!account) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No ${input.platform} account linked to this profile.`,
        });
      }

      // Only Twitch adapter is currently available for live snapshots
      if (input.platform !== "twitch") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Manual snapshots currently only supported for Twitch. ${input.platform} adapter not yet available.`,
        });
      }

      // Dynamically import to avoid bundling adapter in all routes
      const { twitchAdapter } = await import("@/server/adapters/twitch");

      const fetchOptions: { isOAuthConnected: boolean; accessToken?: string } =
        {
          isOAuthConnected: account.isOAuthConnected,
        };
      if (account.accessToken) {
        fetchOptions.accessToken = account.accessToken;
      }

      const snapshotData = await twitchAdapter.fetchSnapshot(
        account.platformUserId,
        fetchOptions,
      );

      const snapshot = await ctx.prisma.metricSnapshot.create({
        data: {
          creatorProfileId: input.creatorProfileId,
          platform: input.platform,
          snapshotAt: snapshotData.snapshotAt,
          followerCount: snapshotData.followerCount,
          followingCount: snapshotData.followingCount,
          totalViews: snapshotData.totalViews,
          subscriberCount: snapshotData.subscriberCount,
          postCount: snapshotData.postCount,
          extendedMetrics:
            snapshotData.extendedMetrics as Prisma.InputJsonValue,
        },
      });

      // Update cached fields on PlatformAccount
      await ctx.prisma.platformAccount.update({
        where: { id: account.id },
        data: {
          followerCount: snapshotData.followerCount,
          totalViews: snapshotData.totalViews,
          lastSyncedAt: new Date(),
        },
      });

      // Update profile aggregate
      const allAccounts = await ctx.prisma.platformAccount.findMany({
        where: { creatorProfileId: input.creatorProfileId },
        select: { followerCount: true, totalViews: true },
      });

      const totalFollowers = allAccounts.reduce(
        (sum, a) => sum + (a.followerCount ?? 0n),
        0n,
      );
      const totalViews = allAccounts.reduce(
        (sum, a) => sum + (a.totalViews ?? 0n),
        0n,
      );

      const newTier = getTierForCreator(totalFollowers);

      await ctx.prisma.creatorProfile.update({
        where: { id: input.creatorProfileId },
        data: {
          totalFollowers,
          totalViews,
          lastSnapshotAt: new Date(),
          snapshotTier: newTier,
        },
      });

      return { snapshotId: snapshot.id, snapshotAt: snapshot.snapshotAt };
    }),
});
