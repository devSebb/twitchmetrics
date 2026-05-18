import { Prisma, prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import { fetchKickCategories, type KickCategory } from "@/server/adapters/kick";
import { AdapterError } from "@/server/adapters/types";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("kick-category-snapshot");

const PAGE_LIMIT = 20;
const MAX_SEARCH_PAGES = 1;
const MAX_GAME_SEARCHES = 40;
const SEARCH_DELAY_MS = 750;
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
    byName: new Map(games.map((game) => [normalizeName(game.name), game])),
    byKickId: new Map(
      existingMappings.map((mapping) => [mapping.platformGameId, mapping.game]),
    ),
  };
}

async function persistCategorySnapshot(
  category: KickCategory,
  game: GameMatch,
  snapshotAt: Date,
) {
  const id = categoryId(category);
  if (!id || !category.name || typeof category.viewer_count !== "number") {
    return false;
  }

  const tags = categoryTags(category);
  const bucketStartedAt = snapshotBucket(snapshotAt);

  await prisma.$transaction([
    prisma.platformGameMapping.upsert({
      where: {
        platform_platformGameId: {
          platform: "kick",
          platformGameId: id,
        },
      },
      update: {
        gameId: game.id,
        platformGameName: category.name,
        thumbnailUrl: category.thumbnail ?? null,
        tags,
        source: "kick_api",
        confidence: "exact_name",
        lastSeenAt: snapshotAt,
      },
      create: {
        gameId: game.id,
        platform: "kick",
        platformGameId: id,
        platformGameName: category.name,
        thumbnailUrl: category.thumbnail ?? null,
        tags,
        source: "kick_api",
        confidence: "exact_name",
        firstSeenAt: snapshotAt,
        lastSeenAt: snapshotAt,
      },
    }),
    prisma.gamePlatformViewerSnapshot.upsert({
      where: {
        gameId_platform_bucketStartedAt: {
          gameId: game.id,
          platform: "kick",
          bucketStartedAt,
        },
      },
      update: {
        platformGameId: id,
        platformGameName: category.name,
        snapshotAt,
        viewers: category.viewer_count,
        channels: null,
        source: "kick_api",
        metadata: {
          tags,
          thumbnail: category.thumbnail ?? null,
        } satisfies Prisma.InputJsonValue,
      },
      create: {
        gameId: game.id,
        platform: "kick",
        platformGameId: id,
        platformGameName: category.name,
        snapshotAt,
        bucketStartedAt,
        viewers: category.viewer_count,
        channels: null,
        source: "kick_api",
        metadata: {
          tags,
          thumbnail: category.thumbnail ?? null,
        } satisfies Prisma.InputJsonValue,
      },
    }),
  ]);

  try {
    await cacheInvalidate(`game:${game.slug}`);
    await cacheInvalidate(`game:${game.slug}:*`);
  } catch {
    // Non-blocking.
  }

  return true;
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
            reason: "KICK API credentials are not configured",
          };
          log.warn(result, "Skipping KICK category snapshot");
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
        const categories = (await step.run("fetch-kick-categories", () =>
          fetchCategoriesForGames(matches.games),
        )) as KickCategory[];

        const snapshotAt = new Date();
        let written = 0;
        let skipped = 0;
        let failed = 0;

        await step.run("persist-category-snapshots", async () => {
          for (const category of categories) {
            const id = categoryId(category);
            const name = category.name?.trim();
            const game =
              (id ? matches.byKickId.get(id) : undefined) ??
              (name ? matches.byName.get(normalizeName(name)) : undefined);

            if (!game) {
              skipped++;
              continue;
            }

            try {
              const didWrite = await persistCategorySnapshot(
                category,
                game,
                snapshotAt,
              );
              if (didWrite) {
                written++;
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
