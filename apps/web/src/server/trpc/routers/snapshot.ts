import { z } from "zod";
import { Platform, Prisma } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../root";
import { adminProcedure } from "../middleware";
import { getTierForCreator } from "@/lib/constants/tiers";

type StreamHatchetAccount = {
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
};

type StreamHatchetPlatform = "kick" | "twitch" | "yt" | "ytg";

type StreamSession = {
  startedAt: string;
  endedAt: string;
  platform: Platform;
  source: "twitch_api" | "streamhatchet";
  game: string | null;
  durationMinutes: number;
  avgViewers: number;
  peakViewers: number;
  title: string | null;
  viewCount: number;
  thumbnailUrl: string | null;
  url: string | null;
  language: string | null;
};

const STREAMHATCHET_SUPPORTED_PLATFORMS: Platform[] = [
  "kick",
  "twitch",
  "youtube",
];

function streamHatchetPlatforms(platform: Platform): StreamHatchetPlatform[] {
  switch (platform) {
    case "kick":
      return ["kick"];
    case "twitch":
      return ["twitch"];
    case "youtube":
      return ["yt", "ytg"];
    default:
      return [];
  }
}

function internalPlatformForStreamHatchet(platform: string): Platform | null {
  switch (platform) {
    case "kick":
      return "kick";
    case "twitch":
      return "twitch";
    case "yt":
    case "ytg":
      return "youtube";
    default:
      return null;
  }
}

async function getStreamHatchetAccounts(
  prisma: {
    platformAccount: {
      findMany: (args: {
        where: {
          creatorProfileId: string;
          platform: { in: Platform[] };
        };
        select: {
          platform: true;
          platformUserId: true;
          platformUsername: true;
        };
      }) => Promise<StreamHatchetAccount[]>;
    };
  },
  creatorProfileId: string,
): Promise<StreamHatchetAccount[]> {
  return prisma.platformAccount.findMany({
    where: {
      creatorProfileId,
      platform: { in: STREAMHATCHET_SUPPORTED_PLATFORMS },
    },
    select: {
      platform: true,
      platformUserId: true,
      platformUsername: true,
    },
  });
}

function streamHatchetIdentityWhere(
  accounts: StreamHatchetAccount[],
): Prisma.StreamSessionFactWhereInput[] {
  return accounts.flatMap((account) => {
    const platforms = streamHatchetPlatforms(account.platform);
    if (platforms.length === 0) return [];

    const identity: Prisma.StreamSessionFactWhereInput[] = [
      { platformUserId: account.platformUserId },
    ];

    return platforms.map((platform) => ({ platform, OR: identity }));
  });
}

function streamHatchetRollupIdentityWhere(
  accounts: StreamHatchetAccount[],
): Prisma.ChannelDailyRollupWhereInput[] {
  return accounts.flatMap((account) => {
    const platforms = streamHatchetPlatforms(account.platform);
    if (platforms.length === 0) return [];

    const identity: Prisma.ChannelDailyRollupWhereInput[] = [
      { platformUserId: account.platformUserId },
    ];

    return platforms.map((platform) => ({ platform, OR: identity }));
  });
}

function streamHatchetGameRollupIdentityWhere(
  accounts: StreamHatchetAccount[],
): Prisma.ChannelGameDailyRollupWhereInput[] {
  return accounts.flatMap((account) => {
    const platforms = streamHatchetPlatforms(account.platform);
    if (platforms.length === 0) return [];

    const identity: Prisma.ChannelGameDailyRollupWhereInput[] = [
      { platformUserId: account.platformUserId },
    ];

    return platforms.map((platform) => ({ platform, OR: identity }));
  });
}

function normalizeGameName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sessionsOverlap(left: StreamSession, right: StreamSession): boolean {
  if (left.platform !== right.platform) return false;
  const leftStart = new Date(left.startedAt).getTime();
  const leftEnd = new Date(left.endedAt).getTime();
  const rightStart = new Date(right.startedAt).getTime();
  const rightEnd = new Date(right.endedAt).getTime();
  const overlap = Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart);
  if (overlap <= 0) return Math.abs(leftStart - rightStart) <= 30 * 60 * 1000;
  const shorter = Math.min(leftEnd - leftStart, rightEnd - rightStart);
  return shorter > 0 && overlap / shorter >= 0.5;
}

function dedupeStreamSessions(sessions: StreamSession[]): StreamSession[] {
  const preferred = [...sessions].sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "streamhatchet" ? -1 : 1;
    }
    return right.startedAt.localeCompare(left.startedAt);
  });

  const kept: StreamSession[] = [];
  for (const session of preferred) {
    if (kept.some((existing) => sessionsOverlap(existing, session))) continue;
    kept.push(session);
  }
  return kept;
}

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
      const streamHatchetAccounts = await getStreamHatchetAccounts(
        ctx.prisma,
        input.creatorProfileId,
      );
      const streamHatchetGameRollupWhere = streamHatchetGameRollupIdentityWhere(
        streamHatchetAccounts,
      );

      if (streamHatchetGameRollupWhere.length > 0) {
        const since = new Date();
        since.setDate(since.getDate() - 30);

        const rollups = await ctx.prisma.channelGameDailyRollup.findMany({
          where: {
            OR: streamHatchetGameRollupWhere,
            date: { gte: since },
          },
          select: {
            platform: true,
            gameName: true,
            sessionCount: true,
            airtimeMinutes: true,
            minutesWatched: true,
          },
          orderBy: { minutesWatched: "desc" },
          take: 1000,
        });

        if (rollups.length > 0) {
          const gameMap = new Map<
            string,
            {
              name: string;
              streamCount: number;
              airtimeMinutes: number;
              minutesWatched: bigint;
              platforms: Set<Platform>;
            }
          >();

          for (const rollup of rollups) {
            const name = rollup.gameName.trim();
            if (!name) continue;

            const platform = internalPlatformForStreamHatchet(rollup.platform);
            const key = normalizeGameName(name);
            const existing = gameMap.get(key);
            if (existing) {
              existing.streamCount += rollup.sessionCount;
              existing.airtimeMinutes += rollup.airtimeMinutes;
              existing.minutesWatched += rollup.minutesWatched;
              if (platform) existing.platforms.add(platform);
            } else {
              gameMap.set(key, {
                name,
                streamCount: rollup.sessionCount,
                airtimeMinutes: rollup.airtimeMinutes,
                minutesWatched: rollup.minutesWatched,
                platforms: platform ? new Set([platform]) : new Set(),
              });
            }
          }

          const sorted = [...gameMap.values()]
            .sort((a, b) =>
              a.minutesWatched === b.minutesWatched
                ? b.streamCount - a.streamCount
                : a.minutesWatched > b.minutesWatched
                  ? -1
                  : 1,
            )
            .slice(0, input.limit);

          const names = sorted.map((game) => game.name);
          const games = await ctx.prisma.game.findMany({
            where: { name: { in: names } },
            select: {
              name: true,
              slug: true,
              coverImageUrl: true,
            },
          });
          const gameByName = new Map(
            games.map((game) => [normalizeGameName(game.name), game] as const),
          );

          return sorted.map((game) => {
            const gameInfo = gameByName.get(normalizeGameName(game.name));
            return {
              gameName: game.name,
              streamCount: game.streamCount,
              avgViewers:
                game.airtimeMinutes > 0
                  ? Math.round(
                      Number(game.minutesWatched) / game.airtimeMinutes,
                    )
                  : 0,
              slug: gameInfo?.slug ?? null,
              coverImageUrl: gameInfo?.coverImageUrl ?? null,
              platforms: [...game.platforms].sort(),
            };
          });
        }
      }

      // Fallback for creators without StreamHatchet rollups: aggregate current
      // game fields from MetricSnapshot extendedMetrics.
      const snapshots = await ctx.prisma.metricSnapshot.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          extendedMetrics: { not: Prisma.DbNull },
        },
        select: { platform: true, extendedMetrics: true },
        orderBy: { snapshotAt: "desc" },
        take: 500,
      });

      // Aggregate game occurrences and avg viewers.
      // Key on twitchGameId when available (stable across renames),
      // fall back to name. Track the most recent display name per key.
      const gameMap = new Map<
        string,
        {
          count: number;
          liveCount: number;
          totalViewers: number;
          name: string;
          twitchGameId: string | null;
          platforms: Set<Platform>;
        }
      >();

      const streamHatchetWhere = streamHatchetIdentityWhere(
        streamHatchetAccounts,
      );
      const streamHatchetSessions =
        streamHatchetWhere.length > 0
          ? await ctx.prisma.streamSessionFact.findMany({
              where: { OR: streamHatchetWhere },
              select: {
                platform: true,
                primaryGameName: true,
                airtimeMinutes: true,
                minutesWatched: true,
              },
              orderBy: { streamBeginsAt: "desc" },
              take: 500,
            })
          : [];
      const streamHatchetGamePlatforms = new Set(
        streamHatchetSessions
          .map((session) => internalPlatformForStreamHatchet(session.platform))
          .filter((platform): platform is Platform => platform !== null),
      );

      for (const snap of snapshots) {
        if (streamHatchetGamePlatforms.has(snap.platform)) continue;
        const ext = snap.extendedMetrics as Record<string, unknown> | null;
        if (!ext) continue;
        const gameName =
          typeof ext.CURRENT_GAME === "string" ? ext.CURRENT_GAME : null;
        const twitchGameId =
          typeof ext.CURRENT_GAME_ID === "string" && ext.CURRENT_GAME_ID
            ? ext.CURRENT_GAME_ID
            : null;
        if (!gameName) continue;

        const isLive =
          typeof ext.AVG_VIEWERS === "number" && ext.AVG_VIEWERS > 0;
        const viewers =
          typeof ext.AVG_VIEWERS === "number" ? ext.AVG_VIEWERS : 0;

        const key = twitchGameId ?? `name:${gameName}`;
        const existing = gameMap.get(key);
        if (existing) {
          existing.count += 1;
          existing.platforms.add(snap.platform);
          if (isLive) {
            existing.liveCount += 1;
            existing.totalViewers += viewers;
          }
        } else {
          gameMap.set(key, {
            count: 1,
            liveCount: isLive ? 1 : 0,
            totalViewers: isLive ? viewers : 0,
            name: gameName,
            twitchGameId,
            platforms: new Set([snap.platform]),
          });
        }
      }

      for (const session of streamHatchetSessions) {
        if (!session.primaryGameName) continue;
        const platform = internalPlatformForStreamHatchet(session.platform);
        const key = `name:${normalizeGameName(session.primaryGameName)}`;
        const viewers =
          session.airtimeMinutes > 0
            ? Number(session.minutesWatched) / session.airtimeMinutes
            : 0;
        const existing = gameMap.get(key);
        if (existing) {
          existing.count += 1;
          existing.liveCount += 1;
          existing.totalViewers += viewers;
          if (platform) existing.platforms.add(platform);
        } else {
          gameMap.set(key, {
            count: 1,
            liveCount: 1,
            totalViewers: viewers,
            name: session.primaryGameName,
            twitchGameId: null,
            platforms: platform ? new Set([platform]) : new Set(),
          });
        }
      }

      // Sort by count and limit
      const sorted = [...gameMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, input.limit);

      // Look up Game table slugs and cover images — prefer twitchGameId match
      const twitchIds = sorted
        .map(([, v]) => v.twitchGameId)
        .filter((id): id is string => id !== null);
      const names = sorted.map(([, v]) => v.name);
      const games = await ctx.prisma.game.findMany({
        where: {
          OR: [
            ...(twitchIds.length > 0
              ? [{ twitchGameId: { in: twitchIds } }]
              : []),
            { name: { in: names } },
          ],
        },
        select: {
          name: true,
          slug: true,
          coverImageUrl: true,
          twitchGameId: true,
        },
      });

      const gameByTwitchId = new Map(
        games
          .filter((g) => g.twitchGameId)
          .map((g) => [g.twitchGameId!, g] as const),
      );
      const gameByName = new Map(games.map((g) => [g.name, g] as const));

      return sorted.map(
        ([
          ,
          { name, twitchGameId, count, liveCount, totalViewers, platforms },
        ]) => {
          const gameInfo =
            (twitchGameId ? gameByTwitchId.get(twitchGameId) : undefined) ??
            gameByName.get(name);
          return {
            gameName: name,
            streamCount: count,
            avgViewers:
              liveCount > 0 ? Math.round(totalViewers / liveCount) : 0,
            slug: gameInfo?.slug ?? null,
            coverImageUrl: gameInfo?.coverImageUrl ?? null,
            platforms: [...platforms].sort(),
          };
        },
      );
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
      // Real Twitch stream history comes from Twitch's Videos API (VOD archive),
      // not from snapshot stitching — snapshot cadence is too sparse for
      // reliable session reconstruction.
      const twitchAccount = await ctx.prisma.platformAccount.findFirst({
        where: {
          creatorProfileId: input.creatorProfileId,
          platform: "twitch",
        },
        select: { platformUserId: true },
      });

      let videos: Awaited<
        ReturnType<typeof import("@/server/adapters/twitch").fetchVideos>
      > = [];
      if (twitchAccount) {
        try {
          const { fetchVideos } = await import("@/server/adapters/twitch");
          videos = await fetchVideos(twitchAccount.platformUserId, {
            limit: 200,
          });
        } catch {
          videos = [];
        }
      }

      // Best-effort game / viewer enrichment: look up creator's snapshots
      // that fall inside each VOD's [createdAt, createdAt + duration] window
      // and pull CURRENT_GAME / PEAK_VIEWERS / AVG_VIEWERS.
      const earliestStart =
        videos.length > 0
          ? videos.reduce(
              (min, v) =>
                new Date(v.createdAt) < min ? new Date(v.createdAt) : min,
              new Date(videos[0]!.createdAt),
            )
          : null;
      const snapshots =
        earliestStart !== null
          ? await ctx.prisma.metricSnapshot.findMany({
              where: {
                creatorProfileId: input.creatorProfileId,
                platform: "twitch",
                snapshotAt: { gte: earliestStart },
                extendedMetrics: { not: Prisma.DbNull },
              },
              select: {
                snapshotAt: true,
                extendedMetrics: true,
              },
              orderBy: { snapshotAt: "asc" },
            })
          : [];

      const sessions: StreamSession[] = videos.map((video) => {
        const start = new Date(video.createdAt);
        const end = new Date(start.getTime() + video.durationSeconds * 1000);

        let game: string | null = null;
        let peak = 0;
        const viewerSamples: number[] = [];

        for (const snap of snapshots) {
          if (snap.snapshotAt < start || snap.snapshotAt > end) continue;
          const ext = snap.extendedMetrics as Record<string, unknown> | null;
          if (!ext) continue;

          if (!game && typeof ext.CURRENT_GAME === "string") {
            game = ext.CURRENT_GAME;
          }
          const avg =
            typeof ext.AVG_VIEWERS === "number"
              ? ext.AVG_VIEWERS
              : typeof ext.LIVE_VIEWER_COUNT === "number"
                ? ext.LIVE_VIEWER_COUNT
                : null;
          if (avg !== null) viewerSamples.push(avg);
          const snapPeak =
            typeof ext.PEAK_VIEWERS === "number" ? ext.PEAK_VIEWERS : null;
          if (snapPeak !== null && snapPeak > peak) peak = snapPeak;
        }

        const avgViewers =
          viewerSamples.length > 0
            ? Math.round(
                viewerSamples.reduce((a, b) => a + b, 0) / viewerSamples.length,
              )
            : 0;

        return {
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
          platform: "twitch",
          source: "twitch_api",
          game,
          durationMinutes: Math.round(video.durationSeconds / 60),
          avgViewers,
          peakViewers: peak,
          title: video.title || null,
          viewCount: video.viewCount,
          thumbnailUrl: video.thumbnailUrl || null,
          url: video.url || null,
          language: video.language,
        };
      });

      const streamHatchetAccounts = await getStreamHatchetAccounts(
        ctx.prisma,
        input.creatorProfileId,
      );
      const streamHatchetWhere = streamHatchetIdentityWhere(
        streamHatchetAccounts,
      );

      if (streamHatchetWhere.length > 0) {
        const streamHatchetSessions =
          await ctx.prisma.streamSessionFact.findMany({
            where: { OR: streamHatchetWhere },
            select: {
              streamBeginsAt: true,
              streamEndsAt: true,
              platform: true,
              primaryGameName: true,
              airtimeMinutes: true,
              averageViewers: true,
              peakViewers: true,
              sessionTitle: true,
              sessionViews: true,
            },
            orderBy: { streamBeginsAt: "desc" },
            take: 200,
          });

        sessions.push(
          ...streamHatchetSessions.flatMap((session): StreamSession[] => {
            const platform = internalPlatformForStreamHatchet(session.platform);
            if (!platform) return [];
            return [
              {
                startedAt: session.streamBeginsAt.toISOString(),
                endedAt: session.streamEndsAt.toISOString(),
                platform,
                source: "streamhatchet",
                game: session.primaryGameName,
                durationMinutes: session.airtimeMinutes,
                avgViewers: Math.round(session.averageViewers),
                peakViewers: session.peakViewers,
                title: session.sessionTitle,
                viewCount: Number(session.sessionViews ?? 0n),
                thumbnailUrl: null,
                url: null,
                language: null,
              },
            ];
          }),
        );
      }

      // Sort
      const sorted = dedupeStreamSessions(sessions).sort((a, b) => {
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

      // Prefer persisted clips (synced via snapshot jobs). Fall back to live
      // Twitch API call only when the creator has no clips in the DB yet.
      const stored = await ctx.prisma.creatorClip.findMany({
        where: { creatorProfileId: input.creatorProfileId },
        orderBy: { viewCount: "desc" },
        take: input.limit,
        select: {
          clipId: true,
          title: true,
          thumbnailUrl: true,
          url: true,
          viewCount: true,
          duration: true,
          gameName: true,
          language: true,
          createdAt: true,
        },
      });

      if (stored.length > 0) {
        return {
          clips: stored.map((c) => ({
            id: c.clipId,
            title: c.title,
            thumbnailUrl: c.thumbnailUrl,
            url: c.url,
            viewCount: c.viewCount,
            duration: c.duration ?? 0,
            gameName: c.gameName,
            language: c.language,
            createdAt: c.createdAt.toISOString(),
          })),
          hasTwitch: true,
        };
      }

      // Fallback: live fetch for creators with no cached clips yet
      try {
        const { fetchClips } = await import("@/server/adapters/twitch");
        const clips = await fetchClips(
          twitchAccount.platformUserId,
          input.limit,
        );
        return {
          clips: clips.map((c) => ({
            id: c.id,
            title: c.title,
            thumbnailUrl: c.thumbnailUrl,
            url: c.url,
            viewCount: c.viewCount,
            duration: c.duration,
            gameName: null as string | null,
            language: c.language,
            createdAt: c.createdAt,
          })),
          hasTwitch: true,
        };
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
      let twitchApiAirTimeSeconds: number | null = null;
      let twitchApiStreamCount = 0;
      let addedTwitchApiAirtime = false;
      let suppressTwitchApiAirtime = false;

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
            twitchApiStreamCount = videos.length;
            twitchApiAirTimeSeconds = videos.reduce(
              (sum, v) => sum + v.durationSeconds,
              0,
            );
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

      const streamHatchetAccounts = await getStreamHatchetAccounts(
        ctx.prisma,
        input.creatorProfileId,
      );
      const streamHatchetWhere = streamHatchetRollupIdentityWhere(
        streamHatchetAccounts,
      );

      if (streamHatchetWhere.length > 0) {
        const rollups = await ctx.prisma.channelDailyRollup.findMany({
          where: {
            date: { gte: since },
            OR: streamHatchetWhere,
          },
          select: {
            platform: true,
            sessionCount: true,
            airtimeMinutes: true,
            minutesWatched: true,
            peakViewers: true,
          },
        });

        if (rollups.length > 0) {
          const streamHatchetRollupPlatforms = new Set<Platform>();
          const streamHatchetAirtimeSeconds =
            rollups.reduce((sum, row) => sum + row.airtimeMinutes, 0) * 60;
          const streamHatchetMinutesWatched = rollups.reduce(
            (sum, row) => sum + Number(row.minutesWatched),
            0,
          );
          const streamHatchetStreamCount = rollups.reduce(
            (sum, row) => sum + row.sessionCount,
            0,
          );
          const streamHatchetPeak = rollups.reduce<number | null>(
            (peak, row) =>
              row.peakViewers === null
                ? peak
                : peak === null
                  ? row.peakViewers
                  : Math.max(peak, row.peakViewers),
            null,
          );

          airTimeSeconds = (airTimeSeconds ?? 0) + streamHatchetAirtimeSeconds;
          streamCount += streamHatchetStreamCount;
          avgAirTimeSeconds =
            streamCount > 0 ? Math.round(airTimeSeconds / streamCount) : null;

          if (streamHatchetPeak !== null) {
            peakViewers =
              peakViewers === null
                ? streamHatchetPeak
                : Math.max(peakViewers, streamHatchetPeak);
          }

          if (streamHatchetAirtimeSeconds > 0) {
            viewerValues.push(
              streamHatchetMinutesWatched / (streamHatchetAirtimeSeconds / 60),
            );
          }

          for (const row of rollups) {
            const platform = internalPlatformForStreamHatchet(row.platform);
            if (platform) {
              allPlatforms.add(platform);
              streamHatchetRollupPlatforms.add(platform);
            }
          }
          suppressTwitchApiAirtime = streamHatchetRollupPlatforms.has("twitch");

          if (
            twitchApiAirTimeSeconds !== null &&
            twitchApiStreamCount > 0 &&
            !suppressTwitchApiAirtime
          ) {
            airTimeSeconds = (airTimeSeconds ?? 0) + twitchApiAirTimeSeconds;
            streamCount += twitchApiStreamCount;
            addedTwitchApiAirtime = true;
            avgAirTimeSeconds =
              streamCount > 0
                ? Math.round((airTimeSeconds ?? 0) / streamCount)
                : null;
          }
        }
      }

      if (
        !addedTwitchApiAirtime &&
        !suppressTwitchApiAirtime &&
        twitchApiAirTimeSeconds !== null &&
        twitchApiStreamCount > 0
      ) {
        airTimeSeconds = (airTimeSeconds ?? 0) + twitchApiAirTimeSeconds;
        streamCount += twitchApiStreamCount;
        avgAirTimeSeconds =
          streamCount > 0 ? Math.round(airTimeSeconds / streamCount) : null;
      }

      const avgViewers =
        viewerValues.length > 0
          ? Math.round(
              viewerValues.reduce((a, b) => a + b, 0) / viewerValues.length,
            )
          : null;

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

      // Update profile aggregate (exclude link-only social accounts —
      // discoverySource != null — so they don't inflate totalFollowers/tier).
      const allAccounts = await ctx.prisma.platformAccount.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          discoverySource: null,
        },
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
          lastSnapshotAt: snapshot.snapshotAt,
          snapshotTier: newTier,
        },
      });

      return { snapshotId: snapshot.id, snapshotAt: snapshot.snapshotAt };
    }),
});
