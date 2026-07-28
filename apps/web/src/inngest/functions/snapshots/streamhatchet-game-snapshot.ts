import { Prisma, prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import {
  fetchStreamHatchetGameDiscovery,
  fetchStreamHatchetLiveChannels,
  fetchStreamHatchetLiveGames,
  internalPlatformForStreamHatchet,
  StreamHatchetError,
  type StreamHatchetGameAggregate,
  type StreamHatchetLiveChannel,
  type StreamHatchetLiveGame,
} from "@/server/adapters/streamhatchet";

const log = createLogger("streamhatchet-game-snapshot");

const PLATFORMS = ["twitch", "ytg", "kick"] as const;
const DISCOVERY_LIMIT = 100;
const LIVE_CHANNEL_GAME_LIMIT = 5;
const LIVE_CHANNEL_TARGET_POOL = 100;
const LIVE_CHANNEL_LIMIT = 15;
const LIVE_BUCKET_MS = 30 * 60 * 1000;
const STREAMHATCHET_MAPPING_PREFIX = "streamhatchet:";

type GameMatch = {
  id: string;
  name: string;
  slug: string;
  genres: string[];
  platforms: string[];
  developer: string | null;
  publisher: string | null;
  releaseDate: Date | null;
};

type LiveChannelsFetchResult =
  | { ok: true; channels: StreamHatchetLiveChannel[] }
  | {
      ok: false;
      code: "rate_limited" | "timeout" | "api_error";
      message: string;
      retryAfterSeconds?: number | undefined;
    };

type LiveGamesFetchResult =
  | { ok: true; rows: StreamHatchetLiveGame[] }
  | {
      ok: false;
      code: "rate_limited" | "timeout" | "api_error";
      message: string;
      retryAfterSeconds?: number | undefined;
    };

function missingCredentialsResult() {
  return {
    result: { scanned: 0, written: 0, skipped: 0, failed: 0 },
    summary: {
      recordsScanned: 0,
      recordsWritten: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      metadata: { skippedReason: "STREAMHATCHET_API_KEY is not configured" },
    },
  };
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function snapshotBucket(date: Date): Date {
  return new Date(Math.floor(date.getTime() / LIVE_BUCKET_MS) * LIVE_BUCKET_MS);
}

function roundMetric(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function streamStartedAt(channel: StreamHatchetLiveChannel): Date | null {
  if (channel.started_at_date) {
    const parsed = new Date(channel.started_at_date);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  if (typeof channel.started_at === "number") {
    const parsed = new Date(channel.started_at * 1000);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  return null;
}

function streamAirtimeSeconds(
  channel: StreamHatchetLiveChannel,
  now: Date,
): number {
  const startedAt = streamStartedAt(channel);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
}

function streamViewerHours(
  channel: StreamHatchetLiveChannel,
  airtimeSeconds: number,
): bigint {
  const viewers = roundMetric(channel.current_viewers);
  return BigInt(Math.max(0, Math.round((viewers * airtimeSeconds) / 3600)));
}

function buildGameLookup(games: GameMatch[]): Map<string, GameMatch> {
  return new Map(games.map((game) => [normalizeName(game.name), game]));
}

function matchDiscoveryGame(
  row: StreamHatchetGameAggregate,
  byName: Map<string, GameMatch>,
): { game: GameMatch; confidence: string } | null {
  const direct = byName.get(normalizeName(row.game));
  if (direct) return { game: direct, confidence: "exact_name" };

  for (const alias of row.metadata?.names ?? []) {
    const game = byName.get(normalizeName(alias));
    if (game) return { game, confidence: "metadata_alias" };
  }

  return null;
}

function matchLiveGame(
  row: StreamHatchetLiveGame,
  byName: Map<string, GameMatch>,
): GameMatch | null {
  const name = typeof row.game === "string" ? row.game : null;
  return name ? (byName.get(normalizeName(name)) ?? null) : null;
}

async function loadGames() {
  return prisma.game.findMany({
    orderBy: [{ currentViewers: "desc" }, { avgViewers7d: "desc" }],
    take: 1_000,
    select: {
      id: true,
      name: true,
      slug: true,
      genres: true,
      platforms: true,
      developer: true,
      publisher: true,
      releaseDate: true,
    },
  });
}

async function loadTopLiveChannelTargets() {
  const games = await prisma.game.findMany({
    orderBy: [{ currentViewers: "desc" }, { avgViewers7d: "desc" }],
    take: LIVE_CHANNEL_TARGET_POOL,
    select: {
      id: true,
      name: true,
      slug: true,
      genres: true,
      platforms: true,
      developer: true,
      publisher: true,
      releaseDate: true,
    },
  });

  const batchCount = Math.max(
    1,
    Math.ceil(games.length / LIVE_CHANNEL_GAME_LIMIT),
  );
  const batchIndex = Math.floor(Date.now() / (60 * 60 * 1000)) % batchCount;
  const offset = batchIndex * LIVE_CHANNEL_GAME_LIMIT;

  return {
    games: games.slice(offset, offset + LIVE_CHANNEL_GAME_LIMIT),
    batchIndex,
    batchCount,
    offset,
    poolSize: games.length,
  };
}

async function safeFetchLiveChannels(
  game: GameMatch,
): Promise<LiveChannelsFetchResult> {
  try {
    const channels = await fetchStreamHatchetLiveChannels({
      game: game.name,
      platforms: [...PLATFORMS],
      limit: LIVE_CHANNEL_LIMIT,
    });
    return { ok: true, channels };
  } catch (error) {
    if (error instanceof StreamHatchetError) {
      return {
        ok: false,
        code:
          error.code === "rate_limited" || error.code === "timeout"
            ? error.code
            : "api_error",
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    return {
      ok: false,
      code: "api_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function safeFetchLiveGames(): Promise<LiveGamesFetchResult> {
  try {
    const rows = await fetchStreamHatchetLiveGames({
      platforms: [...PLATFORMS],
    });
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof StreamHatchetError) {
      return {
        ok: false,
        code:
          error.code === "rate_limited" || error.code === "timeout"
            ? error.code
            : "api_error",
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    return {
      ok: false,
      code: "api_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function persistDiscoveryRow(
  row: StreamHatchetGameAggregate,
  game: GameMatch,
  confidence: string,
  snapshotAt: Date,
) {
  const metadata = row.metadata;
  const streamHatchetGameId = String(row.game_id);
  const tags = metadata?.genre?.filter(Boolean) ?? [];
  const platformNames = metadata?.platform?.filter(Boolean) ?? [];
  const releaseDate = metadata?.release_date
    ? new Date(metadata.release_date)
    : null;
  const validReleaseDate =
    releaseDate && Number.isFinite(releaseDate.getTime()) ? releaseDate : null;

  await prisma.$transaction(async (tx) => {
    for (const platformRow of row.platform_data ?? []) {
      const platform = internalPlatformForStreamHatchet(platformRow.platform);
      if (!platform) continue;

      await tx.platformGameMapping.upsert({
        where: {
          platform_platformGameId: {
            platform,
            platformGameId: `${STREAMHATCHET_MAPPING_PREFIX}${streamHatchetGameId}`,
          },
        },
        update: {
          gameId: game.id,
          platformGameName: row.game,
          tags,
          source: "streamhatchet_discovery",
          confidence,
          lastSeenAt: snapshotAt,
        },
        create: {
          gameId: game.id,
          platform,
          platformGameId: `${STREAMHATCHET_MAPPING_PREFIX}${streamHatchetGameId}`,
          platformGameName: row.game,
          tags,
          source: "streamhatchet_discovery",
          confidence,
          firstSeenAt: snapshotAt,
          lastSeenAt: snapshotAt,
        },
      });
    }

    await tx.game.update({
      where: { id: game.id },
      data: {
        ...(game.genres.length === 0 && tags.length > 0
          ? { genres: tags }
          : {}),
        ...(game.platforms.length === 0 && platformNames.length > 0
          ? { platforms: platformNames }
          : {}),
        ...(!game.developer && metadata?.developer?.[0]
          ? { developer: metadata.developer[0] }
          : {}),
        ...(!game.publisher && metadata?.publisher?.[0]
          ? { publisher: metadata.publisher[0] }
          : {}),
        ...(!game.releaseDate && validReleaseDate
          ? { releaseDate: validReleaseDate }
          : {}),
      },
    });
  });
}

// Kick has no other follower source: the official Kick API returns no
// follower counts and the S3 daily-sessions feed has no follower field. SH
// live-channel rows DO carry `followers`, so harvest them here — refresh the
// matched PlatformAccount and accrue at most one follower MetricSnapshot per
// account per ~day so kick follower history builds up organically.
const KICK_FOLLOWER_SNAPSHOT_MIN_AGE_MS = 20 * 60 * 60 * 1000;

async function syncKickFollowersFromLiveChannels(
  channels: StreamHatchetLiveChannel[],
  snapshotAt: Date,
) {
  const followersByUserId = new Map<string, number>();
  for (const channel of channels) {
    if (internalPlatformForStreamHatchet(channel.platform) !== "kick") continue;
    const followers = channel.followers;
    if (
      typeof followers !== "number" ||
      !Number.isFinite(followers) ||
      followers < 0
    ) {
      continue;
    }
    followersByUserId.set(String(channel.user_id), Math.round(followers));
  }
  if (followersByUserId.size === 0) return;

  const accounts = await prisma.platformAccount.findMany({
    where: {
      platform: "kick",
      platformUserId: { in: [...followersByUserId.keys()] },
    },
    select: { id: true, creatorProfileId: true, platformUserId: true },
  });

  for (const account of accounts) {
    const followers = followersByUserId.get(account.platformUserId);
    if (followers === undefined) continue;

    await prisma.platformAccount.update({
      where: { id: account.id },
      data: { followerCount: BigInt(followers), lastSyncedAt: snapshotAt },
    });

    const recentSnapshot = await prisma.metricSnapshot.findFirst({
      where: {
        creatorProfileId: account.creatorProfileId,
        platform: "kick",
        followerCount: { not: null },
        snapshotAt: {
          gte: new Date(
            snapshotAt.getTime() - KICK_FOLLOWER_SNAPSHOT_MIN_AGE_MS,
          ),
        },
      },
      select: { id: true },
    });
    if (recentSnapshot) continue;

    await prisma.metricSnapshot.create({
      data: {
        creatorProfileId: account.creatorProfileId,
        platform: "kick",
        snapshotAt,
        followerCount: BigInt(followers),
        extendedMetrics: { SOURCE: "streamhatchet_live_channels" },
      },
    });
  }
}

async function persistLiveChannels(
  game: GameMatch,
  channels: StreamHatchetLiveChannel[],
  snapshotAt: Date,
) {
  const rows = channels
    .map((channel) => {
      const platform = internalPlatformForStreamHatchet(channel.platform);
      if (!platform) return null;

      const channelName =
        channel.display_name?.trim() || channel.username?.trim();
      if (!channelName) return null;

      const airtime = streamAirtimeSeconds(channel, snapshotAt);
      const startedAt = streamStartedAt(channel);

      return {
        gameId: game.id,
        platform,
        source: "streamhatchet_live",
        platformUserId: String(channel.user_id),
        channelName,
        avatarUrl: channel.logo ?? null,
        slug: null,
        streamTitle: channel.title ?? null,
        language: channel.language ?? null,
        startedAt,
        category: "most_watched",
        avgViewers: roundMetric(channel.current_viewers),
        airtime,
        viewerHours: streamViewerHours(channel, airtime),
        updatedAt: snapshotAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await prisma.gameTopChannel.deleteMany({
    where: {
      gameId: game.id,
      source: "streamhatchet_live",
    },
  });

  for (const row of rows) {
    await prisma.gameTopChannel.upsert({
      where: {
        gameId_platform_source_channelName: {
          gameId: row.gameId,
          platform: row.platform,
          source: row.source,
          channelName: row.channelName,
        },
      },
      update: row,
      create: row,
    });
  }

  try {
    await syncKickFollowersFromLiveChannels(channels, snapshotAt);
  } catch (error) {
    // Follower harvesting is best-effort; never fail the game persist over it.
    log.warn(
      { err: error, game: game.name },
      "Kick follower sync from live channels failed",
    );
  }
}

function liveGamePlatformRows(row: StreamHatchetLiveGame) {
  if (Array.isArray(row.platform_data) && row.platform_data.length > 0) {
    return row.platform_data
      .map((platformRow) => {
        const platform = internalPlatformForStreamHatchet(platformRow.platform);
        if (!platform) return null;
        return {
          platform,
          viewers: roundMetric(
            platformRow.current_viewers ?? platformRow.viewers,
          ),
          channels: roundMetric(
            platformRow.live_channels ?? platformRow.channels,
          ),
        };
      })
      .filter((platformRow): platformRow is NonNullable<typeof platformRow> => {
        return platformRow !== null;
      });
  }

  const platform = internalPlatformForStreamHatchet(
    typeof row.platform === "string" ? row.platform : null,
  );
  if (!platform) return [];

  return [
    {
      platform,
      viewers: roundMetric(row.current_viewers ?? row.viewers),
      channels: roundMetric(row.live_channels ?? row.channels),
    },
  ];
}

async function persistLiveGameRows(
  rows: StreamHatchetLiveGame[],
  games: GameMatch[],
  snapshotAt: Date,
) {
  const byName = buildGameLookup(games);
  const bucketStartedAt = snapshotBucket(snapshotAt);
  let written = 0;
  let skipped = 0;

  for (const row of rows) {
    const game = matchLiveGame(row, byName);
    if (!game) {
      skipped++;
      continue;
    }

    for (const platformRow of liveGamePlatformRows(row)) {
      if (platformRow.viewers === 0 && platformRow.channels === 0) continue;

      await prisma.gamePlatformViewerSnapshot.upsert({
        where: {
          gameId_platform_source_bucketStartedAt: {
            gameId: game.id,
            platform: platformRow.platform,
            source: "streamhatchet_live",
            bucketStartedAt,
          },
        },
        update: {
          platformGameId:
            row.game_id === null || row.game_id === undefined
              ? null
              : `${STREAMHATCHET_MAPPING_PREFIX}${String(row.game_id)}`,
          platformGameName: typeof row.game === "string" ? row.game : null,
          snapshotAt,
          viewers: platformRow.viewers,
          channels: platformRow.channels,
          metadata: row as Prisma.InputJsonValue,
        },
        create: {
          gameId: game.id,
          platform: platformRow.platform,
          platformGameId:
            row.game_id === null || row.game_id === undefined
              ? null
              : `${STREAMHATCHET_MAPPING_PREFIX}${String(row.game_id)}`,
          platformGameName: typeof row.game === "string" ? row.game : null,
          snapshotAt,
          bucketStartedAt,
          viewers: platformRow.viewers,
          channels: platformRow.channels,
          source: "streamhatchet_live",
          metadata: row as Prisma.InputJsonValue,
        },
      });
      written++;
    }
  }

  return { written, skipped };
}

async function invalidateGames(games: Pick<GameMatch, "slug">[]) {
  for (const game of games) {
    try {
      await cacheInvalidate(`game:${game.slug}`);
      await cacheInvalidate(`game:${game.slug}:*`);
    } catch {
      // Non-blocking.
    }
  }
}

export const streamHatchetGameDiscoverySnapshot = inngest.createFunction(
  { id: "streamhatchet-game-discovery-snapshot", concurrency: { limit: 1 } },
  [
    { cron: "35 */6 * * *" },
    { event: "snapshots/streamhatchet-game-discovery" },
  ],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "enrichment",
        jobType: "streamhatchet-game-discovery-snapshot",
        platform: "streamhatchet",
      },
      async () => {
        if (!process.env.STREAMHATCHET_API_KEY) {
          log.warn(
            "Skipping StreamHatchet discovery snapshot; missing API key",
          );
          return missingCredentialsResult();
        }

        const games = (await step.run("load-games", loadGames)) as GameMatch[];
        const byName = buildGameLookup(games);
        const rows = (await step.run("fetch-game-discovery", () =>
          fetchStreamHatchetGameDiscovery({
            platforms: [...PLATFORMS],
            excludedGenres: "Non Gaming",
            limit: DISCOVERY_LIMIT,
            sortBy: "hours_watched",
            order: "desc",
          }),
        )) as StreamHatchetGameAggregate[];

        const snapshotAt = new Date();

        const persistResult = (await step.run(
          "persist-game-discovery",
          async () => {
            const touchedGamesById = new Map<string, Pick<GameMatch, "slug">>();
            let written = 0;
            let skipped = 0;

            for (const row of rows) {
              const match = matchDiscoveryGame(row, byName);
              if (!match) {
                skipped++;
                continue;
              }

              await persistDiscoveryRow(
                row,
                match.game,
                match.confidence,
                snapshotAt,
              );
              touchedGamesById.set(match.game.id, { slug: match.game.slug });
              written++;
            }

            return {
              written,
              skipped,
              touchedGames: [...touchedGamesById.values()],
            };
          },
        )) as {
          written: number;
          skipped: number;
          touchedGames: Array<Pick<GameMatch, "slug">>;
        };

        await step.run("invalidate-games", () =>
          invalidateGames(persistResult.touchedGames),
        );

        return {
          result: {
            scanned: rows.length,
            written: persistResult.written,
            skipped: persistResult.skipped,
            failed: 0,
          },
          summary: {
            recordsScanned: rows.length,
            recordsWritten: persistResult.written,
            recordsSkipped: persistResult.skipped,
            recordsFailed: 0,
          },
        };
      },
      step,
    );
  },
);

export const streamHatchetLiveChannelsSnapshot = inngest.createFunction(
  { id: "streamhatchet-live-channels-snapshot", concurrency: { limit: 1 } },
  [
    { cron: "45 */1 * * *" },
    { event: "snapshots/streamhatchet-live-channels" },
  ],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "snapshot",
        jobType: "streamhatchet-live-channels-snapshot",
        platform: "streamhatchet",
      },
      async () => {
        if (!process.env.STREAMHATCHET_API_KEY) {
          log.warn(
            "Skipping StreamHatchet live channels snapshot; missing API key",
          );
          return missingCredentialsResult();
        }

        const targetBatch = (await step.run(
          "load-live-channel-targets",
          loadTopLiveChannelTargets,
        )) as Awaited<ReturnType<typeof loadTopLiveChannelTargets>>;
        const games = targetBatch.games;
        const snapshotAt = new Date();
        const touchedGames: GameMatch[] = [];
        let scanned = 0;
        let written = 0;
        let skipped = 0;
        let failed = 0;
        let rateLimited = false;

        for (const [index, game] of games.entries()) {
          if (index > 0) {
            await step.sleep(`streamhatchet-live-channel-pause-${index}`, "5s");
          }

          const fetchResult = (await step.run(
            `fetch-live-channels-${game.slug}`,
            () => safeFetchLiveChannels(game),
          )) as LiveChannelsFetchResult;

          if (!fetchResult.ok) {
            if (fetchResult.code === "rate_limited") {
              rateLimited = true;
              log.warn(
                {
                  game: game.name,
                  retryAfterSeconds: fetchResult.retryAfterSeconds,
                },
                "StreamHatchet live channels rate limited; stopping early",
              );
              break;
            }

            if (fetchResult.code === "timeout") {
              skipped++;
              log.warn(
                { game: game.name },
                "StreamHatchet live channels request timed out; skipping game",
              );
              continue;
            }

            failed++;
            log.warn(
              { error: fetchResult.message, game: game.name },
              "Live channel fetch failed",
            );
            continue;
          }

          scanned += fetchResult.channels.length;
          await step.run(`persist-live-channels-${game.slug}`, () =>
            persistLiveChannels(game, fetchResult.channels, snapshotAt),
          );
          touchedGames.push(game);
          written += fetchResult.channels.length;
        }

        await step.run("invalidate-games", () => invalidateGames(touchedGames));

        return {
          result: { scanned, written, skipped, failed, rateLimited },
          summary: {
            recordsScanned: scanned,
            recordsWritten: written,
            recordsSkipped: skipped,
            recordsFailed: failed,
            metadata: {
              rateLimited,
              batchIndex: targetBatch.batchIndex,
              batchCount: targetBatch.batchCount,
              offset: targetBatch.offset,
              poolSize: targetBatch.poolSize,
              requestedGames: games.map((game) => game.name),
            },
          },
        };
      },
      step,
    );
  },
);

export const streamHatchetLiveGamesSnapshot = inngest.createFunction(
  { id: "streamhatchet-live-games-snapshot", concurrency: { limit: 1 } },
  [{ cron: "5 */1 * * *" }, { event: "snapshots/streamhatchet-live-games" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "snapshot",
        jobType: "streamhatchet-live-games-snapshot",
        platform: "streamhatchet",
      },
      async () => {
        if (!process.env.STREAMHATCHET_API_KEY) {
          log.warn(
            "Skipping StreamHatchet live games snapshot; missing API key",
          );
          return missingCredentialsResult();
        }

        const games = (await step.run("load-games", loadGames)) as GameMatch[];
        let rows: StreamHatchetLiveGame[] = [];
        let rateLimited = false;

        const fetchResult = (await step.run(
          "fetch-live-games",
          safeFetchLiveGames,
        )) as LiveGamesFetchResult;

        if (!fetchResult.ok) {
          if (fetchResult.code === "rate_limited") {
            rateLimited = true;
            log.warn(
              { retryAfterSeconds: fetchResult.retryAfterSeconds },
              "StreamHatchet live games rate limited; skipping run",
            );
          } else if (fetchResult.code === "timeout") {
            log.warn("StreamHatchet live games timed out; skipping run");
          } else {
            throw new Error(fetchResult.message);
          }
        } else {
          rows = fetchResult.rows;
        }

        const snapshotAt = new Date();
        const { written, skipped } =
          rows.length === 0
            ? { written: 0, skipped: 0 }
            : await step.run("persist-live-game-rows", () =>
                persistLiveGameRows(rows, games, snapshotAt),
              );

        return {
          result: {
            scanned: rows.length,
            written,
            skipped,
            failed: 0,
            rateLimited,
          },
          summary: {
            recordsScanned: rows.length,
            recordsWritten: written,
            recordsSkipped: skipped,
            recordsFailed: 0,
            metadata: { rateLimited },
          },
        };
      },
      step,
    );
  },
);
