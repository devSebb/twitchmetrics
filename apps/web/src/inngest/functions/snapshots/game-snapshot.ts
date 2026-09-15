import { prisma, type Prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { fetchClipsByGame, twitchAdapter } from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import { deriveGameMetrics } from "@/server/services/game-metrics";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("game-snapshot");

const SNAPSHOT_BATCH_SIZE = 5;
// Games per Inngest step. A full run is ~0.5 s/game, so 100 games ≈ 50–60 s —
// well inside the 300 s maxDuration a single step request gets.
const GAMES_PER_STEP = 100;
// Matches the */30 cron: every snapshot of a run is stamped with its slot.
const SLOT_MS = 30 * 60 * 1000;
// One game's DB writes (snapshot, metrics, languages, top channels) commit
// together, so a killed step can no longer leave a game stripped of rows.
const GAME_TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 };
// Pagination ceiling for /streams per game. Each page is 100 streams, so 50
// pages = top 5,000 streams. Most games terminate well before the ceiling
// (the loop breaks when Twitch returns no cursor). Only the biggest categories
// (Just Chatting, GTA V, Valorant, Fortnite) actually pay the full cost.
const STREAM_PAGE_LIMIT = 50;
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
  db: Prisma.TransactionClient,
  gameId: string,
  streams: Awaited<
    ReturnType<NonNullable<typeof twitchAdapter.fetchGameLiveStats>>
  >["streams"],
) {
  await db.gameBroadcastLanguage.deleteMany({ where: { gameId } });

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
    await db.gameBroadcastLanguage.createMany({ data: rows });
  }
}

async function refreshTopChannels(
  db: Prisma.TransactionClient,
  game: TrackedGame,
  streams: Awaited<
    ReturnType<NonNullable<typeof twitchAdapter.fetchGameLiveStats>>
  >["streams"],
  snapshotAt: Date,
) {
  await db.gameTopChannel.deleteMany({
    where: { gameId: game.id, platform: "twitch", source: "twitch_api" },
  });

  if (streams.length === 0) {
    return;
  }

  const sortedByViewers = [...streams].sort(
    (left, right) => right.viewerCount - left.viewerCount,
  );
  const mostWatched = sortedByViewers.slice(0, 6);
  const mostWatchedUserIds = new Set(mostWatched.map((s) => s.userId));
  const cutoff = snapshotAt.getTime() - EMERGING_WINDOW_HOURS * 60 * 60 * 1000;

  // "Emerging" = recently-started streams that aren't already in mostWatched.
  // Excluding mostWatched here is what prevents duplicate (gameId, channelName)
  // rows further down — without it, a top streamer who started in the window
  // would appear in both arrays and get inserted twice.
  const emergingPool = sortedByViewers.filter(
    (stream) =>
      new Date(stream.startedAt).getTime() >= cutoff &&
      !mostWatchedUserIds.has(stream.userId),
  );
  const fallbackPool = sortedByViewers.filter(
    (stream) => !mostWatchedUserIds.has(stream.userId),
  );
  const emerging = [...emergingPool, ...fallbackPool]
    .filter(
      (stream, index, array) =>
        array.findIndex((candidate) => candidate.userId === stream.userId) ===
        index,
    )
    .slice(0, 5);

  // Belt-and-suspenders: dedupe the combined list by userId before insert,
  // so even an upstream API quirk can't produce duplicate rows.
  const seenUserIds = new Set<string>();
  const rows = [...mostWatched, ...emerging]
    .filter((stream) => {
      if (seenUserIds.has(stream.userId)) return false;
      seenUserIds.add(stream.userId);
      return true;
    })
    .map((stream) => {
      const liveDurationSeconds = Math.max(
        0,
        Math.floor(
          (snapshotAt.getTime() - new Date(stream.startedAt).getTime()) / 1000,
        ),
      );
      const viewerHours = BigInt(
        Math.round(stream.viewerCount * (liveDurationSeconds / 3600)),
      );
      const category = mostWatchedUserIds.has(stream.userId)
        ? "most_watched"
        : "emerging";

      return {
        gameId: game.id,
        platform: "twitch" as const,
        source: "twitch_api",
        platformUserId: stream.userId,
        channelName: stream.userName,
        avatarUrl: null,
        slug: stream.userLogin.toLowerCase(),
        language: stream.language || null,
        startedAt: new Date(stream.startedAt),
        category,
        // avgViewers holds viewers at snapshot time; viewerHours is an
        // estimate (viewersNow × hoursLive). See GameTopChannel in schema.
        avgViewers: stream.viewerCount,
        airtime: liveDurationSeconds,
        viewerHours,
      };
    });

  await db.gameTopChannel.createMany({ data: rows });
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
  slotAt: Date,
) {
  // Network first: nothing below holds a transaction open during API calls.
  const liveStats = await twitchAdapter.fetchGameLiveStats!(
    game.twitchGameId!,
    {
      maxPages: STREAM_PAGE_LIMIT,
    },
  );

  const catalogEntry = catalogById.get(game.twitchGameId!);
  const nextCoverImageUrl = catalogEntry?.boxArtUrl ?? game.coverImageUrl;

  await prisma.$transaction(async (tx) => {
    // Stamped with the run's slot: a retried step hits the
    // (gameId, snapshotAt) unique key and inserts nothing.
    await tx.gameViewerSnapshot.createMany({
      data: [
        {
          gameId: game.id,
          snapshotAt: slotAt,
          twitchViewers: liveStats.viewerCount,
          twitchChannels: liveStats.channelCount,
          totalViewers: liveStats.viewerCount,
          totalChannels: liveStats.channelCount,
        },
      ],
      skipDuplicates: true,
    });

    const since7d = new Date(slotAt.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentSnapshots = await tx.gameViewerSnapshot.findMany({
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

    const metrics = deriveGameMetrics(recentSnapshots, slotAt);

    await tx.game.update({
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

    await refreshBroadcastLanguages(tx, game.id, liveStats.streams);
    await refreshTopChannels(tx, game, liveStats.streams, liveStats.snapshotAt);
  }, GAME_TX_OPTIONS);

  // Clips call the Twitch API, so they stay outside the transaction.
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

        // Memoized, so every page and every retry of this run shares one slot.
        const slotIso = await step.run("resolve-slot", async () =>
          new Date(Math.floor(Date.now() / SLOT_MS) * SLOT_MS).toISOString(),
        );
        const slotAt = new Date(slotIso);

        // Ids only: full rows for every page would all ride in step output.
        const trackedGameIds = await step.run(
          "load-tracked-games",
          async () => {
            const games = await prisma.game.findMany({
              where: { twitchGameId: { not: null } },
              select: { id: true },
              orderBy: { id: "asc" },
            });
            return games.map((game) => game.id);
          },
        );

        const catalogById = new Map(
          topCatalog.map((entry) => [entry.platformGameId, entry] as const),
        );

        const snapshotResults = {
          totalTracked: trackedGameIds.length,
          processed: 0,
          failed: 0,
          truncated: 0,
        };

        // One step per page keeps each request far below maxDuration; a
        // killed page retries alone and its snapshots dedupe on the slot key.
        for (const [pageIndex, pageIds] of chunk(
          trackedGameIds,
          GAMES_PER_STEP,
        ).entries()) {
          const pageResult = await step.run(
            `snapshot-page-${pageIndex}`,
            async () => {
              const games = await prisma.game.findMany({
                where: { id: { in: pageIds }, twitchGameId: { not: null } },
                select: {
                  id: true,
                  slug: true,
                  twitchGameId: true,
                  coverImageUrl: true,
                  igdbId: true,
                },
              });

              let processed = 0;
              let failed = 0;
              let truncated = 0;

              for (const batch of chunk(games, SNAPSHOT_BATCH_SIZE)) {
                const results = await Promise.all(
                  batch.map(async (game) => {
                    try {
                      const result = await snapshotTrackedGame(
                        game,
                        catalogById,
                        slotAt,
                      );
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

              return { processed, failed, truncated };
            },
          );

          snapshotResults.processed += pageResult.processed;
          snapshotResults.failed += pageResult.failed;
          snapshotResults.truncated += pageResult.truncated;
        }

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
              slotAt: slotIso,
              pages: Math.ceil(trackedGameIds.length / GAMES_PER_STEP),
            },
          },
        };
      },
      step,
    );
  },
);
