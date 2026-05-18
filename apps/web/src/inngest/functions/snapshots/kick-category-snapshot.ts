import { Prisma, prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import {
  fetchKickCategories,
  fetchKickCategoryById,
  fetchKickLivestreams,
  type KickCategory,
  type KickLivestream,
} from "@/server/adapters/kick";
import { AdapterError } from "@/server/adapters/types";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("kick-category-snapshot");

const PAGE_LIMIT = 20;
const MAX_SEARCH_PAGES = 1;
const MAX_GAME_SEARCHES = 40;
const SEARCH_DELAY_MS = 750;
const MAX_TOP_STREAMS = 10;
const SNAPSHOT_BUCKET_MS = 30 * 60 * 1000;

type GameMatch = {
  id: string;
  name: string;
  slug: string;
};

type GameSearchTarget = GameMatch & {
  currentViewers: number;
  avgViewers7d: number;
};

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function snapshotBucket(date: Date): Date {
  return new Date(
    Math.floor(date.getTime() / SNAPSHOT_BUCKET_MS) * SNAPSHOT_BUCKET_MS,
  );
}

function categoryId(category: KickCategory): string | null {
  return category.id === undefined ? null : String(category.id);
}

function categoryTags(category: KickCategory): string[] {
  return Array.isArray(category.tags) ? category.tags.filter(Boolean) : [];
}

function streamName(stream: KickLivestream): string | null {
  return stream.slug ?? null;
}

function streamAirtimeSeconds(stream: KickLivestream, now: Date): number {
  if (!stream.started_at) return 0;
  const startedAt = new Date(stream.started_at).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((now.getTime() - startedAt) / 1000));
}

function streamViewerHours(
  stream: KickLivestream,
  airtimeSeconds: number,
): bigint {
  const viewers =
    typeof stream.viewer_count === "number" ? stream.viewer_count : 0;
  return BigInt(Math.max(0, Math.round((viewers * airtimeSeconds) / 3600)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCategoriesForGames(
  games: GameSearchTarget[],
): Promise<KickCategory[]> {
  const categoriesById = new Map<string, KickCategory>();

  for (const [index, game] of games.slice(0, MAX_GAME_SEARCHES).entries()) {
    if (index > 0) await sleep(SEARCH_DELAY_MS);

    let cursor: string | null = null;

    for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
      let result: Awaited<ReturnType<typeof fetchKickCategories>>;
      try {
        result = await fetchKickCategories({
          limit: PAGE_LIMIT,
          cursor,
          search: game.name,
        });
      } catch (error) {
        if (error instanceof AdapterError && error.code === "rate_limited") {
          log.warn(
            {
              searchedGames: index,
              collectedCategories: categoriesById.size,
            },
            "KICK category search rate limited; using partial results",
          );
          return [...categoriesById.values()];
        }
        throw error;
      }

      for (const category of result.categories) {
        const id = categoryId(category);
        if (id) categoriesById.set(id, category);
      }

      if (!result.cursor) break;
      cursor = result.cursor;
    }
  }

  return [...categoriesById.values()];
}

async function loadGameMatches() {
  const [games, existingMappings] = await Promise.all([
    prisma.game.findMany({
      orderBy: [{ currentViewers: "desc" }, { avgViewers7d: "desc" }],
      take: MAX_GAME_SEARCHES,
      select: {
        id: true,
        name: true,
        slug: true,
        currentViewers: true,
        avgViewers7d: true,
      },
    }),
    prisma.platformGameMapping.findMany({
      where: { platform: "kick" },
      select: {
        platformGameId: true,
        game: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
  ]);

  return {
    games,
    existingMappings: existingMappings.map((mapping) => ({
      platformGameId: mapping.platformGameId,
      game: mapping.game,
    })),
  };
}

async function persistCategorySnapshot(
  category: KickCategory,
  game: GameMatch,
  snapshotAt: Date,
) {
  const id = categoryId(category);
  if (!id || !category.name) return null;
  const categoryName = category.name;

  let detail: KickCategory | null = null;
  let livestreams: KickLivestream[] = [];

  try {
    [detail, livestreams] = await Promise.all([
      fetchKickCategoryById(id),
      fetchKickLivestreams({
        categoryId: id,
        limit: 100,
        sort: "viewer_count",
      }),
    ]);
  } catch (error) {
    if (error instanceof AdapterError && error.code === "rate_limited") {
      log.warn(
        { categoryId: id, categoryName: category.name },
        "KICK category metrics rate limited; writing mapping only",
      );
    } else {
      throw error;
    }
  }

  const enrichedCategory = detail ?? category;
  const tags = categoryTags(category);
  const bucketStartedAt = snapshotBucket(snapshotAt);
  const categoryViewerCount =
    typeof enrichedCategory.viewer_count === "number"
      ? enrichedCategory.viewer_count
      : null;
  const livestreamViewerCount = livestreams.reduce(
    (sum, stream) =>
      sum + (typeof stream.viewer_count === "number" ? stream.viewer_count : 0),
    0,
  );
  const viewerCount = categoryViewerCount ?? livestreamViewerCount;
  const hasViewerCount = viewerCount > 0 || categoryViewerCount !== null;
  const channelCount = livestreams.length;

  await prisma.$transaction(async (tx) => {
    await tx.platformGameMapping.upsert({
      where: {
        platform_platformGameId: {
          platform: "kick",
          platformGameId: id,
        },
      },
      update: {
        gameId: game.id,
        platformGameName: categoryName,
        thumbnailUrl: enrichedCategory.thumbnail ?? category.thumbnail ?? null,
        tags,
        source: "kick_api",
        confidence: "exact_name",
        lastSeenAt: snapshotAt,
      },
      create: {
        gameId: game.id,
        platform: "kick",
        platformGameId: id,
        platformGameName: categoryName,
        thumbnailUrl: enrichedCategory.thumbnail ?? category.thumbnail ?? null,
        tags,
        source: "kick_api",
        confidence: "exact_name",
        firstSeenAt: snapshotAt,
        lastSeenAt: snapshotAt,
      },
    });

    if (hasViewerCount) {
      await tx.gamePlatformViewerSnapshot.upsert({
        where: {
          gameId_platform_source_bucketStartedAt: {
            gameId: game.id,
            platform: "kick",
            source: "kick_api",
            bucketStartedAt,
          },
        },
        update: {
          platformGameId: id,
          platformGameName: categoryName,
          snapshotAt,
          viewers: viewerCount,
          channels: channelCount,
          source: "kick_api",
          metadata: {
            tags,
            thumbnail: enrichedCategory.thumbnail ?? category.thumbnail ?? null,
            viewerCountSource:
              categoryViewerCount === null ? "livestreams" : "category_detail",
          } satisfies Prisma.InputJsonValue,
        },
        create: {
          gameId: game.id,
          platform: "kick",
          platformGameId: id,
          platformGameName: categoryName,
          snapshotAt,
          bucketStartedAt,
          viewers: viewerCount,
          channels: channelCount,
          source: "kick_api",
          metadata: {
            tags,
            thumbnail: enrichedCategory.thumbnail ?? category.thumbnail ?? null,
            viewerCountSource:
              categoryViewerCount === null ? "livestreams" : "category_detail",
          } satisfies Prisma.InputJsonValue,
        },
      });
    }

    for (const stream of livestreams.slice(0, MAX_TOP_STREAMS)) {
      const name = streamName(stream);
      if (!name) continue;
      const airtime = streamAirtimeSeconds(stream, snapshotAt);
      await tx.gameTopChannel.upsert({
        where: {
          gameId_platform_source_channelName: {
            gameId: game.id,
            platform: "kick",
            source: "kick_api",
            channelName: name,
          },
        },
        update: {
          platformUserId:
            stream.broadcaster_user_id === undefined
              ? null
              : String(stream.broadcaster_user_id),
          avatarUrl: stream.profile_picture ?? null,
          slug: null,
          streamTitle: stream.stream_title ?? null,
          language: stream.language ?? null,
          startedAt: stream.started_at ? new Date(stream.started_at) : null,
          category: "most_watched",
          avgViewers:
            typeof stream.viewer_count === "number" ? stream.viewer_count : 0,
          airtime,
          viewerHours: streamViewerHours(stream, airtime),
          updatedAt: snapshotAt,
        },
        create: {
          gameId: game.id,
          platform: "kick",
          source: "kick_api",
          platformUserId:
            stream.broadcaster_user_id === undefined
              ? null
              : String(stream.broadcaster_user_id),
          channelName: name,
          avatarUrl: stream.profile_picture ?? null,
          slug: null,
          streamTitle: stream.stream_title ?? null,
          language: stream.language ?? null,
          startedAt: stream.started_at ? new Date(stream.started_at) : null,
          category: "most_watched",
          avgViewers:
            typeof stream.viewer_count === "number" ? stream.viewer_count : 0,
          airtime,
          viewerHours: streamViewerHours(stream, airtime),
          updatedAt: snapshotAt,
        },
      });
    }
  });

  try {
    await cacheInvalidate(`game:${game.slug}`);
    await cacheInvalidate(`game:${game.slug}:*`);
  } catch {
    // Non-blocking.
  }

  return { mapped: true, snapshotted: hasViewerCount };
}

export const kickCategorySnapshot = inngest.createFunction(
  { id: "kick-category-snapshot", concurrency: { limit: 1 } },
  [{ cron: "20 */1 * * *" }, { event: "snapshots/kick-categories" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "snapshot",
        jobType: "kick-category-snapshot",
        platform: "kick",
      },
      async () => {
        if (!process.env.KICK_CLIENT_ID || !process.env.KICK_CLIENT_SECRET) {
          const result = {
            scanned: 0,
            written: 0,
            skipped: 0,
            failed: 0,
          };
          log.warn(
            { ...result, reason: "KICK API credentials are not configured" },
            "Skipping KICK category snapshot",
          );
          return {
            result,
            summary: {
              recordsScanned: 0,
              recordsWritten: 0,
              recordsSkipped: 0,
              recordsFailed: 0,
            },
          };
        }

        const matches = (await step.run(
          "load-game-matches",
          loadGameMatches,
        )) as Awaited<ReturnType<typeof loadGameMatches>>;
        const byName = new Map(
          matches.games.map((game) => [normalizeName(game.name), game]),
        );
        const byKickId = new Map(
          matches.existingMappings.map((mapping) => [
            mapping.platformGameId,
            mapping.game,
          ]),
        );
        const categories = (await step.run("fetch-kick-categories", () =>
          fetchCategoriesForGames(matches.games),
        )) as KickCategory[];

        const snapshotAt = new Date();
        let written = 0;
        let snapshotted = 0;
        let skipped = 0;
        let failed = 0;

        await step.run("persist-category-snapshots", async () => {
          for (const category of categories) {
            const id = categoryId(category);
            const name = category.name?.trim();
            const game =
              (id ? byKickId.get(id) : undefined) ??
              (name ? byName.get(normalizeName(name)) : undefined);

            if (!game) {
              skipped++;
              continue;
            }

            try {
              const result = await persistCategorySnapshot(
                category,
                game,
                snapshotAt,
              );
              if (result?.mapped) {
                written++;
                if (result.snapshotted) snapshotted++;
              } else {
                skipped++;
              }
            } catch (error) {
              failed++;
              log.warn(
                {
                  err: error,
                  categoryId: id,
                  categoryName: name,
                  gameId: game.id,
                },
                "Failed to persist KICK category snapshot",
              );
            }
          }
        });

        const result = {
          scanned: categories.length,
          written,
          snapshotted,
          skipped,
          failed,
        };

        log.info(result, "KICK category snapshot completed");

        return {
          result,
          summary: {
            recordsScanned: categories.length,
            recordsWritten: written,
            recordsSkipped: skipped,
            recordsFailed: failed,
          },
        };
      },
    );
  },
);
