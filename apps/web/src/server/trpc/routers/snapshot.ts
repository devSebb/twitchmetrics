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

  getRecentStreams: publicProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(10),
        sortBy: z
          .enum(["date", "game", "duration", "avgViewers", "peakViewers"])
          .default("date"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Fetch snapshots that contain live stream data (extended metrics)
      const snapshots = await ctx.prisma.metricSnapshot.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          extendedMetrics: { not: Prisma.DbNull },
        },
        select: {
          snapshotAt: true,
          extendedMetrics: true,
        },
        orderBy: { snapshotAt: "asc" },
        take: 2000,
      });

      // Group consecutive snapshots into stream sessions
      // Detect session boundaries as gaps > 1 hour between snapshots
      type StreamSession = {
        startedAt: string;
        endedAt: string;
        game: string | null;
        durationMinutes: number;
        avgViewers: number;
        peakViewers: number;
      };

      const sessions: StreamSession[] = [];
      let currentSession: {
        start: Date;
        end: Date;
        game: string | null;
        viewers: number[];
        peak: number;
      } | null = null;

      const SESSION_GAP_MS = 60 * 60 * 1000; // 1 hour

      for (const snap of snapshots) {
        const ext = snap.extendedMetrics as Record<string, unknown> | null;
        if (!ext) continue;

        // Only consider snapshots where the channel was live
        const viewerCount =
          typeof ext.LIVE_VIEWER_COUNT === "number"
            ? ext.LIVE_VIEWER_COUNT
            : typeof ext.AVG_VIEWERS === "number"
              ? ext.AVG_VIEWERS
              : null;

        if (viewerCount === null) continue;

        const game =
          typeof ext.currentGame === "string" ? ext.currentGame : null;

        if (
          currentSession &&
          snap.snapshotAt.getTime() - currentSession.end.getTime() <
            SESSION_GAP_MS
        ) {
          // Continue session
          currentSession.end = snap.snapshotAt;
          currentSession.viewers.push(viewerCount);
          if (viewerCount > currentSession.peak)
            currentSession.peak = viewerCount;
          if (game && !currentSession.game) currentSession.game = game;
        } else {
          // Close previous session
          if (currentSession) {
            const avg =
              currentSession.viewers.reduce((a, b) => a + b, 0) /
              currentSession.viewers.length;
            sessions.push({
              startedAt: currentSession.start.toISOString(),
              endedAt: currentSession.end.toISOString(),
              game: currentSession.game,
              durationMinutes: Math.round(
                (currentSession.end.getTime() -
                  currentSession.start.getTime()) /
                  60000,
              ),
              avgViewers: Math.round(avg),
              peakViewers: currentSession.peak,
            });
          }
          // Start new session
          currentSession = {
            start: snap.snapshotAt,
            end: snap.snapshotAt,
            game,
            viewers: [viewerCount],
            peak: viewerCount,
          };
        }
      }

      // Close last session
      if (currentSession) {
        const avg =
          currentSession.viewers.reduce((a, b) => a + b, 0) /
          currentSession.viewers.length;
        sessions.push({
          startedAt: currentSession.start.toISOString(),
          endedAt: currentSession.end.toISOString(),
          game: currentSession.game,
          durationMinutes: Math.round(
            (currentSession.end.getTime() - currentSession.start.getTime()) /
              60000,
          ),
          avgViewers: Math.round(avg),
          peakViewers: currentSession.peak,
        });
      }

      // Sort
      const sorted = [...sessions].sort((a, b) => {
        switch (input.sortBy) {
          case "date":
            return input.sortOrder === "desc"
              ? b.startedAt.localeCompare(a.startedAt)
              : a.startedAt.localeCompare(b.startedAt);
          case "game":
            return input.sortOrder === "desc"
              ? (b.game ?? "").localeCompare(a.game ?? "")
              : (a.game ?? "").localeCompare(b.game ?? "");
          case "duration":
            return input.sortOrder === "desc"
              ? b.durationMinutes - a.durationMinutes
              : a.durationMinutes - b.durationMinutes;
          case "avgViewers":
            return input.sortOrder === "desc"
              ? b.avgViewers - a.avgViewers
              : a.avgViewers - b.avgViewers;
          case "peakViewers":
            return input.sortOrder === "desc"
              ? b.peakViewers - a.peakViewers
              : a.peakViewers - b.peakViewers;
          default:
            return 0;
        }
      });

      // Paginate
      const total = sorted.length;
      const start = (input.page - 1) * input.pageSize;
      const paginated = sorted.slice(start, start + input.pageSize);

      return { sessions: paginated, total, page: input.page };
    }),

  getFeaturedClips: publicProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        limit: z.number().int().min(1).max(12).default(6),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Find the Twitch PlatformAccount for this creator
      const twitchAccount = await ctx.prisma.platformAccount.findFirst({
        where: {
          creatorProfileId: input.creatorProfileId,
          platform: "twitch",
        },
        select: { platformUserId: true },
      });

      if (!twitchAccount) {
        return { clips: [], hasTwitch: false };
      }

      try {
        const { fetchClips } = await import("@/server/adapters/twitch");
        const clips = await fetchClips(
          twitchAccount.platformUserId,
          input.limit,
        );
        return { clips, hasTwitch: true };
      } catch {
        return { clips: [], hasTwitch: true };
      }
    }),

  getStreamingStats: publicProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        period: z.enum(["30d", "3m", "6m", "1y"]).default("30d"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const periodDays: Record<string, number> = {
        "30d": 30,
        "3m": 90,
        "6m": 180,
        "1y": 365,
      };
      const days = periodDays[input.period] ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const now = new Date();

      // Fetch snapshots with extendedMetrics for viewer stats
      const snapshots = await ctx.prisma.metricSnapshot.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          snapshotAt: { gte: since },
        },
        select: {
          platform: true,
          snapshotAt: true,
          followerCount: true,
          extendedMetrics: true,
        },
        orderBy: { snapshotAt: "asc" },
      });

      // Extract viewer stats from extendedMetrics
      let peakViewers: number | null = null;
      const viewerValues: number[] = [];
      const platformsWithViewerData = new Set<Platform>();

      for (const snap of snapshots) {
        const ext = snap.extendedMetrics as Record<string, unknown> | null;
        if (!ext) continue;

        const peak =
          typeof ext.PEAK_VIEWERS === "number"
            ? ext.PEAK_VIEWERS
            : typeof ext.LIVE_VIEWER_COUNT === "number"
              ? ext.LIVE_VIEWER_COUNT
              : null;

        if (peak !== null) {
          if (peakViewers === null || peak > peakViewers) peakViewers = peak;
          platformsWithViewerData.add(snap.platform);
        }

        const avg =
          typeof ext.AVG_VIEWERS === "number"
            ? ext.AVG_VIEWERS
            : typeof ext.LIVE_VIEWER_COUNT === "number"
              ? ext.LIVE_VIEWER_COUNT
              : null;

        if (avg !== null && avg > 0) {
          viewerValues.push(avg);
        }
      }

      const avgViewers =
        viewerValues.length > 0
          ? Math.round(
              viewerValues.reduce((a, b) => a + b, 0) / viewerValues.length,
            )
          : null;

      // Followers gain: per-platform first/last followerCount diff
      const platformFirstLast = new Map<
        Platform,
        { first: bigint | null; last: bigint | null }
      >();

      for (const snap of snapshots) {
        if (snap.followerCount === null) continue;
        const existing = platformFirstLast.get(snap.platform);
        if (!existing) {
          platformFirstLast.set(snap.platform, {
            first: snap.followerCount,
            last: snap.followerCount,
          });
        } else {
          existing.last = snap.followerCount;
        }
      }

      let followersGain = 0;
      const platformsWithFollowerData: Platform[] = [];
      for (const [platform, { first, last }] of platformFirstLast) {
        if (first !== null && last !== null) {
          followersGain += Number(last - first);
          platformsWithFollowerData.push(platform);
        }
      }

      // Airtime from Twitch Videos API
      let airTimeSeconds: number | null = null;
      let avgAirTimeSeconds: number | null = null;
      let streamCount = 0;

      try {
        const twitchAccount = await ctx.prisma.platformAccount.findFirst({
          where: {
            creatorProfileId: input.creatorProfileId,
            platform: "twitch",
          },
          select: { platformUserId: true },
        });

        if (twitchAccount) {
          const { fetchVideos } = await import("@/server/adapters/twitch");
          const videos = await fetchVideos(twitchAccount.platformUserId, {
            startedAfter: since,
            limit: 200,
          });

          if (videos.length > 0) {
            streamCount = videos.length;
            airTimeSeconds = videos.reduce(
              (sum, v) => sum + v.durationSeconds,
              0,
            );
            avgAirTimeSeconds = Math.round(airTimeSeconds / streamCount);
          }
        }
      } catch {
        // Twitch API unavailable — airtime fields stay null
      }

      // Determine which platforms are represented
      const allPlatforms = new Set<Platform>([
        ...platformsWithViewerData,
        ...platformsWithFollowerData,
      ]);

      return {
        airTimeSeconds,
        avgAirTimeSeconds,
        streamCount,
        peakViewers,
        avgViewers,
        followersGain,
        periodStart: since.toISOString(),
        periodEnd: now.toISOString(),
        platforms: [...allPlatforms] as Platform[],
      };
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
