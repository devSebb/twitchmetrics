import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { fetchClipsByGame, twitchAdapter } from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import { deriveGameMetrics } from "@/server/services/game-metrics";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("game-snapshot");

const SNAPSHOT_BATCH_SIZE = 5;
const STREAM_PAGE_LIMIT = 5;
const EMERGING_WINDOW_HOURS = 12;

type TrackedGame = {
  id: string;
  slug: string;
  twitchGameId: string | null;
  coverImageUrl: string | null;
  igdbId: number | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function resolveLanguageLabel(language: string): string {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(language) ??
      language.toUpperCase()
    );
  } catch {
    return language.toUpperCase();
  }
}

async function refreshBroadcastLanguages(
  gameId: string,
  streams: Awaited<
    ReturnType<NonNullable<typeof twitchAdapter.fetchGameLiveStats>>
  >["streams"],
) {
  await prisma.gameBroadcastLanguage.deleteMany({ where: { gameId } });

  if (streams.length === 0) {
    return;
  }

  const counts = new Map<string, number>();
  for (const stream of streams) {
    const language = stream.language || "other";
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const total = streams.length;
  const rows = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([language, count]) => ({
      gameId,
      language,
      label: resolveLanguageLabel(language),
      percent: (count / total) * 100,
    }));

  if (rows.length > 0) {
    await prisma.gameBroadcastLanguage.createMany({ data: rows });
  }
}

async function refreshTopChannels(
  game: TrackedGame,
  streams: Awaited<
    ReturnType<NonNullable<typeof twitchAdapter.fetchGameLiveStats>>
  >["streams"],
  snapshotAt: Date,
) {
  await prisma.gameTopChannel.deleteMany({ where: { gameId: game.id } });

  if (streams.length === 0) {
    return;
  }

  const sortedByViewers = [...streams].sort(
    (left, right) => right.viewerCount - left.viewerCount,
  );
  const mostWatched = sortedByViewers.slice(0, 6);
  const cutoff = snapshotAt.getTime() - EMERGING_WINDOW_HOURS * 60 * 60 * 1000;

  const emergingPool = sortedByViewers.filter(
    (stream) => new Date(stream.startedAt).getTime() >= cutoff,
  );
  const fallbackPool = sortedByViewers.filter(
    (stream) =>
      !mostWatched.some((candidate) => candidate.userId === stream.userId),
  );
  const emerging = [...emergingPool, ...fallbackPool]
    .filter(
      (stream, index, array) =>
        array.findIndex((candidate) => candidate.userId === stream.userId) ===
        index,
    )
    .slice(0, 5);

  const rows = [...mostWatched, ...emerging].map((stream) => {
    const liveDurationSeconds = Math.max(
      0,
      Math.floor(
        (snapshotAt.getTime() - new Date(stream.startedAt).getTime()) / 1000,
      ),
    );
    const viewerHours = BigInt(
      Math.round(stream.viewerCount * (liveDurationSeconds / 3600)),
    );
    const category = mostWatched.some(
      (candidate) => candidate.userId === stream.userId,
    )
      ? "most_watched"
      : "emerging";

    return {
      gameId: game.id,
      channelName: stream.userName,
      avatarUrl: null,
      slug: stream.userLogin.toLowerCase(),
      category,
      avgViewers: stream.viewerCount,
      airtime: liveDurationSeconds,
      viewerHours,
    };
  });

  await prisma.gameTopChannel.createMany({ data: rows });
}

async function refreshClips(gameId: string, twitchGameId: string) {
  const clips = await fetchClipsByGame(twitchGameId, 8);
  const clipIds = clips.map((clip) => clip.id);

  await prisma.gameClip.deleteMany({
    where: {
      gameId,
      ...(clipIds.length > 0 ? { clipId: { notIn: clipIds } } : {}),
    },
  });

  for (const clip of clips) {
    await prisma.gameClip.upsert({
      where: { gameId_clipId: { gameId, clipId: clip.id } },
      update: {
        title: clip.title,
        thumbnailUrl: clip.thumbnailUrl,
        url: clip.url,
        viewCount: clip.viewCount,
        createdAt: new Date(clip.createdAt),
      },
      create: {
        gameId,
        clipId: clip.id,
        title: clip.title,
        thumbnailUrl: clip.thumbnailUrl,
        url: clip.url,
        viewCount: clip.viewCount,
        createdAt: new Date(clip.createdAt),
      },
    });
  }
}

async function snapshotTrackedGame(
  game: TrackedGame,
  catalogById: Map<
    string,
    Awaited<
      ReturnType<NonNullable<typeof twitchAdapter.fetchTopGamesCatalog>>
    >[number]
  >,
) {
  const liveStats = await twitchAdapter.fetchGameLiveStats!(
    game.twitchGameId!,
    {
      maxPages: STREAM_PAGE_LIMIT,
    },
  );

  await prisma.gameViewerSnapshot.create({
    data: {
      gameId: game.id,
      snapshotAt: liveStats.snapshotAt,
      twitchViewers: liveStats.viewerCount,
      twitchChannels: liveStats.channelCount,
      totalViewers: liveStats.viewerCount,
      totalChannels: liveStats.channelCount,
    },
  });

  const since7d = new Date(
    liveStats.snapshotAt.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const recentSnapshots = await prisma.gameViewerSnapshot.findMany({
    where: {
      gameId: game.id,
      snapshotAt: { gte: since7d },
    },
    orderBy: { snapshotAt: "asc" },
    select: {
      snapshotAt: true,
      totalViewers: true,
      totalChannels: true,
    },
  });

  const metrics = deriveGameMetrics(recentSnapshots, liveStats.snapshotAt);
  const catalogEntry = catalogById.get(game.twitchGameId!);
  const nextCoverImageUrl = catalogEntry?.boxArtUrl ?? game.coverImageUrl;

  await prisma.game.update({
    where: { id: game.id },
    data: {
      currentViewers: metrics.currentViewers,
      currentChannels: metrics.currentChannels,
      peakViewers24h: metrics.peakViewers24h,
      avgViewers7d: metrics.avgViewers7d,
      avgLiveChannels: metrics.avgLiveChannels,
      hoursWatched7d: metrics.hoursWatched7d,
      ...(catalogEntry?.igdbId && !game.igdbId
        ? { igdbId: catalogEntry.igdbId }
        : {}),
      ...(nextCoverImageUrl && nextCoverImageUrl !== game.coverImageUrl
        ? { coverImageUrl: nextCoverImageUrl }
        : {}),
    },
  });

  await refreshBroadcastLanguages(game.id, liveStats.streams);
  await refreshTopChannels(game, liveStats.streams, liveStats.snapshotAt);
  await refreshClips(game.id, game.twitchGameId!);

  try {
    await cacheInvalidate(`game:${game.slug}`);
    await cacheInvalidate(`game:${game.slug}:*`);
  } catch {
    // Non-blocking
  }

  return {
    truncated: liveStats.truncated,
    viewerCount: liveStats.viewerCount,
    channelCount: liveStats.channelCount,
  };
}

// Cron: every 30 minutes — fetch live stats for all tracked games and write snapshots
export const gameSnapshot = inngest.createFunction(
  { id: "game-snapshot", concurrency: { limit: 1 } },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "snapshot",
        jobType: "game-snapshot",
        platform: "twitch",
      },
      async () => {
        const topCatalog = await step.run(
          "fetch-top-game-catalog",
          async () => {
            return twitchAdapter.fetchTopGamesCatalog!(100);
          },
        );

        const trackedGames = await step.run("load-tracked-games", async () => {
          return prisma.game.findMany({
            where: { twitchGameId: { not: null } },
            select: {
              id: true,
              slug: true,
              twitchGameId: true,
              coverImageUrl: true,
              igdbId: true,
            },
          });
        });

        const catalogById = new Map(
          topCatalog.map((entry) => [entry.platformGameId, entry] as const),
        );

        const snapshotResults = await step.run(
          "snapshot-tracked-games",
          async () => {
            let processed = 0;
            let failed = 0;
            let truncated = 0;

            for (const batch of chunk(trackedGames, SNAPSHOT_BATCH_SIZE)) {
              const results = await Promise.all(
                batch.map(async (game) => {
                  try {
                    const result = await snapshotTrackedGame(game, catalogById);
                    return { ok: true as const, result };
                  } catch (error) {
                    log.warn(
                      {
                        gameId: game.id,
                        slug: game.slug,
                        error: (error as Error).message,
                      },
                      "Game snapshot failed",
                    );
                    return { ok: false as const };
                  }
                }),
              );

              for (const result of results) {
                if (result.ok) {
                  processed++;
                  if (result.result.truncated) truncated++;
                } else {
                  failed++;
                }
              }
            }

            return {
              totalTracked: trackedGames.length,
              processed,
              failed,
              truncated,
            };
          },
        );

        log.info(snapshotResults, "Game snapshot completed");
        return {
          result: snapshotResults,
          summary: {
            recordsScanned: snapshotResults.totalTracked,
            recordsWritten: snapshotResults.processed,
            recordsFailed: snapshotResults.failed,
            partialCount: snapshotResults.truncated,
            metadata: {
              totalTracked: snapshotResults.totalTracked,
            },
          },
        };
      },
    );
  },
);
