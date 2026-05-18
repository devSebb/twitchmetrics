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
const LIVE_CHANNEL_GAME_LIMIT = 25;
const LIVE_CHANNEL_LIMIT = 25;
const LIVE_CHANNEL_DELAY_MS = 2_500;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return prisma.game.findMany({
    orderBy: [{ currentViewers: "desc" }, { avgViewers7d: "desc" }],
    take: LIVE_CHANNEL_GAME_LIMIT,
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

        const touchedGames: GameMatch[] = [];
        let written = 0;
        let skipped = 0;
        const snapshotAt = new Date();

        await step.run("persist-game-discovery", async () => {
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
            touchedGames.push(match.game);
            written++;
          }
        });

        await step.run("invalidate-games", () => invalidateGames(touchedGames));

        return {
          result: { scanned: rows.length, written, skipped, failed: 0 },
          summary: {
            recordsScanned: rows.length,
            recordsWritten: written,
            recordsSkipped: skipped,
            recordsFailed: 0,
          },
        };
      },
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

        const games = (await step.run(
          "load-live-channel-targets",
          loadTopLiveChannelTargets,
        )) as GameMatch[];
        const snapshotAt = new Date();
        const touchedGames: GameMatch[] = [];
        let scanned = 0;
        let written = 0;
        let skipped = 0;
        let failed = 0;
        let rateLimited = false;

        for (const [index, game] of games.entries()) {
          if (index > 0) await sleep(LIVE_CHANNEL_DELAY_MS);

          try {
            const channels = (await step.run(
              `fetch-live-channels-${game.slug}`,
              () =>
                fetchStreamHatchetLiveChannels({
                  game: game.name,
                  platforms: [...PLATFORMS],
                  limit: LIVE_CHANNEL_LIMIT,
                }),
            )) as StreamHatchetLiveChannel[];

            scanned += channels.length;
            await step.run(`persist-live-channels-${game.slug}`, () =>
              persistLiveChannels(game, channels, snapshotAt),
            );
            touchedGames.push(game);
            written += channels.length;
          } catch (error) {
            if (
              error instanceof StreamHatchetError &&
              error.code === "rate_limited"
            ) {
              rateLimited = true;
              log.warn(
                { game: game.name, retryAfterSeconds: error.retryAfterSeconds },
                "StreamHatchet live channels rate limited; stopping early",
              );
              break;
            }

            failed++;
            log.warn(
              { err: error, game: game.name },
              "Live channel fetch failed",
            );
          }
        }

        await step.run("invalidate-games", () => invalidateGames(touchedGames));

        return {
          result: { scanned, written, skipped, failed, rateLimited },
          summary: {
            recordsScanned: scanned,
            recordsWritten: written,
            recordsSkipped: skipped,
            recordsFailed: failed,
            metadata: { rateLimited },
          },
        };
      },
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

        try {
          rows = (await step.run("fetch-live-games", () =>
            fetchStreamHatchetLiveGames({ platforms: [...PLATFORMS] }),
          )) as StreamHatchetLiveGame[];
        } catch (error) {
          if (
            error instanceof StreamHatchetError &&
            error.code === "rate_limited"
          ) {
            rateLimited = true;
            log.warn(
              { retryAfterSeconds: error.retryAfterSeconds },
              "StreamHatchet live games rate limited; skipping run",
            );
          } else {
            throw error;
          }
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
    );
  },
);
