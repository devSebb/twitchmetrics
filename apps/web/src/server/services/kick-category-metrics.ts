import { Prisma, prisma } from "@twitchmetrics/database";
import { cacheInvalidate } from "@/server/services/cache";
import {
  fetchKickCategories,
  fetchKickCategoryById,
  fetchKickLivestreams,
  type KickCategory,
  type KickLivestream,
} from "@/server/adapters/kick";
import { AdapterError } from "@/server/adapters/types";

const DISCOVERY_PAGE_LIMIT = 100;
const DISCOVERY_MAX_PAGES = 20;
const DISCOVERY_GAME_LIMIT = 1_000;
const REQUEST_DELAY_MS = 750;
const MAX_TOP_STREAMS = 10;
const SNAPSHOT_BUCKET_MS = 30 * 60 * 1000;

type GameMatch = {
  id: string;
  name: string;
  slug: string;
};

type KickMapping = {
  id: string;
  platformGameId: string;
  platformGameName: string;
  game: GameMatch;
};

export type KickCategoryDiscoveryResult = {
  gamesConsidered: number;
  categoriesScanned: number;
  written: number;
  skipped: number;
  failed: number;
  rateLimited: boolean;
};

export type KickCategorySnapshotResult = {
  scanned: number;
  written: number;
  snapshotted: number;
  skipped: number;
  failed: number;
  rateLimited: boolean;
  touchedGames: GameMatch[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function isRateLimited(error: unknown): boolean {
  return error instanceof AdapterError && error.code === "rate_limited";
}

function addAlias(
  aliases: Map<string, GameMatch | null>,
  alias: string | null | undefined,
  game: GameMatch,
) {
  if (!alias?.trim()) return;
  const key = normalizeName(alias);
  const existing = aliases.get(key);
  if (!existing) {
    aliases.set(key, existing === null ? null : game);
    return;
  }
  if (existing.id !== game.id) aliases.set(key, null);
}

async function loadDiscoveryAliases() {
  const [games, kickMappings] = await Promise.all([
    prisma.game.findMany({
      orderBy: [{ currentViewers: "desc" }, { avgViewers7d: "desc" }],
      take: DISCOVERY_GAME_LIMIT,
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
    prisma.platformGameMapping.findMany({
      where: { platform: "kick" },
      select: {
        platformGameName: true,
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

  const aliases = new Map<string, GameMatch | null>();
  for (const game of games) addAlias(aliases, game.name, game);
  for (const mapping of kickMappings) {
    addAlias(aliases, mapping.platformGameName, mapping.game);
  }

  return { aliases, gamesConsidered: games.length };
}

async function fetchKickCategoryCatalog() {
  const categoriesById = new Map<string, KickCategory>();
  let cursor: string | null = null;
  let rateLimited = false;

  for (let page = 0; page < DISCOVERY_MAX_PAGES; page++) {
    if (page > 0) await sleep(REQUEST_DELAY_MS);

    try {
      const result = await fetchKickCategories({
        limit: DISCOVERY_PAGE_LIMIT,
        cursor,
      });

      for (const category of result.categories) {
        const id = categoryId(category);
        if (id) categoriesById.set(id, category);
      }

      if (!result.cursor) break;
      cursor = result.cursor;
    } catch (error) {
      if (isRateLimited(error)) {
        rateLimited = true;
        break;
      }
      throw error;
    }
  }

  return { categories: [...categoriesById.values()], rateLimited };
}

async function persistKickMapping(
  category: KickCategory,
  game: GameMatch,
  snapshotAt: Date,
) {
  const id = categoryId(category);
  const name = category.name?.trim();
  if (!id || !name) return false;

  const tags = categoryTags(category);
  const confidence =
    normalizeName(name) === normalizeName(game.name) ? "exact_name" : "alias";

  await prisma.platformGameMapping.upsert({
    where: {
      platform_platformGameId: {
        platform: "kick",
        platformGameId: id,
      },
    },
    update: {
      gameId: game.id,
      platformGameName: name,
      thumbnailUrl: category.thumbnail ?? null,
      tags,
      source: "kick_api",
      confidence,
      lastSeenAt: snapshotAt,
    },
    create: {
      gameId: game.id,
      platform: "kick",
      platformGameId: id,
      platformGameName: name,
      thumbnailUrl: category.thumbnail ?? null,
      tags,
      source: "kick_api",
      confidence,
      firstSeenAt: snapshotAt,
      lastSeenAt: snapshotAt,
    },
  });

  return true;
}

export async function discoverKickCategoryMappings(): Promise<KickCategoryDiscoveryResult> {
  const [{ aliases, gamesConsidered }, catalog] = await Promise.all([
    loadDiscoveryAliases(),
    fetchKickCategoryCatalog(),
  ]);
  const snapshotAt = new Date();
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const category of catalog.categories) {
    const name = category.name?.trim();
    const game = name ? aliases.get(normalizeName(name)) : undefined;
    if (!game) {
      skipped++;
      continue;
    }

    try {
      if (await persistKickMapping(category, game, snapshotAt)) {
        written++;
      } else {
        skipped++;
      }
    } catch {
      failed++;
    }
  }

  return {
    gamesConsidered,
    categoriesScanned: catalog.categories.length,
    written,
    skipped,
    failed,
    rateLimited: catalog.rateLimited,
  };
}

async function loadKickMappings(limit?: number): Promise<KickMapping[]> {
  return prisma.platformGameMapping.findMany({
    where: {
      platform: "kick",
      source: { in: ["kick_api", "manual"] },
    },
    orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
    ...(limit === undefined ? {} : { take: limit }),
    select: {
      id: true,
      platformGameId: true,
      platformGameName: true,
      game: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

async function persistKickCategorySnapshot(
  mapping: KickMapping,
  snapshotAt: Date,
) {
  let detail: KickCategory | null = null;
  let livestreams: KickLivestream[] = [];

  [detail, livestreams] = await Promise.all([
    fetchKickCategoryById(mapping.platformGameId),
    fetchKickLivestreams({
      categoryId: mapping.platformGameId,
      limit: 100,
      sort: "viewer_count",
    }),
  ]);

  const categoryName = detail?.name ?? mapping.platformGameName;
  const tags = detail ? categoryTags(detail) : [];
  const bucketStartedAt = snapshotBucket(snapshotAt);
  const categoryViewerCount =
    typeof detail?.viewer_count === "number" ? detail.viewer_count : null;
  const livestreamViewerCount = livestreams.reduce(
    (sum, stream) =>
      sum + (typeof stream.viewer_count === "number" ? stream.viewer_count : 0),
    0,
  );
  const viewerCount = categoryViewerCount ?? livestreamViewerCount;
  const hasViewerCount = viewerCount > 0 || categoryViewerCount !== null;
  const channelCount = livestreams.length;

  await prisma.$transaction(async (tx) => {
    await tx.platformGameMapping.update({
      where: { id: mapping.id },
      data: {
        platformGameName: categoryName,
        thumbnailUrl: detail?.thumbnail ?? null,
        tags,
        lastSeenAt: snapshotAt,
      },
    });

    if (hasViewerCount) {
      await tx.gamePlatformViewerSnapshot.upsert({
        where: {
          gameId_platform_source_bucketStartedAt: {
            gameId: mapping.game.id,
            platform: "kick",
            source: "kick_api",
            bucketStartedAt,
          },
        },
        update: {
          platformGameId: mapping.platformGameId,
          platformGameName: categoryName,
          snapshotAt,
          viewers: viewerCount,
          channels: channelCount,
          source: "kick_api",
          metadata: {
            tags,
            thumbnail: detail?.thumbnail ?? null,
            viewerCountSource:
              categoryViewerCount === null ? "livestreams" : "category_detail",
          } satisfies Prisma.InputJsonValue,
        },
        create: {
          gameId: mapping.game.id,
          platform: "kick",
          platformGameId: mapping.platformGameId,
          platformGameName: categoryName,
          snapshotAt,
          bucketStartedAt,
          viewers: viewerCount,
          channels: channelCount,
          source: "kick_api",
          metadata: {
            tags,
            thumbnail: detail?.thumbnail ?? null,
            viewerCountSource:
              categoryViewerCount === null ? "livestreams" : "category_detail",
          } satisfies Prisma.InputJsonValue,
        },
      });
    }

    await tx.gameTopChannel.deleteMany({
      where: {
        gameId: mapping.game.id,
        platform: "kick",
        source: "kick_api",
      },
    });

    const seenChannelNames = new Set<string>();
    for (const stream of livestreams.slice(0, MAX_TOP_STREAMS)) {
      const name = streamName(stream);
      if (!name) continue;
      const channelKey = normalizeName(name);
      if (seenChannelNames.has(channelKey)) continue;
      seenChannelNames.add(channelKey);

      const airtime = streamAirtimeSeconds(stream, snapshotAt);
      const row = {
        gameId: mapping.game.id,
        platform: "kick" as const,
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
      };

      await tx.gameTopChannel.upsert({
        where: {
          gameId_platform_source_channelName: {
            gameId: mapping.game.id,
            platform: "kick",
            source: "kick_api",
            channelName: name,
          },
        },
        update: row,
        create: row,
      });
    }
  });

  await cacheInvalidate(`game:${mapping.game.slug}`).catch(() => undefined);
  await cacheInvalidate(`game:${mapping.game.slug}:*`).catch(() => undefined);

  return { snapshotted: hasViewerCount };
}

export async function snapshotKickCategoryMappings(
  input: {
    limit?: number;
  } = {},
): Promise<KickCategorySnapshotResult> {
  const mappings = await loadKickMappings(input.limit);
  const snapshotAt = new Date();
  const touchedGamesById = new Map<string, GameMatch>();
  let written = 0;
  let snapshotted = 0;
  let skipped = 0;
  let failed = 0;
  let rateLimited = false;

  for (const [index, mapping] of mappings.entries()) {
    if (index > 0) await sleep(REQUEST_DELAY_MS);

    try {
      const result = await persistKickCategorySnapshot(mapping, snapshotAt);
      written++;
      if (result.snapshotted) snapshotted++;
      touchedGamesById.set(mapping.game.id, mapping.game);
    } catch (error) {
      if (isRateLimited(error)) {
        rateLimited = true;
        break;
      }
      if (error instanceof AdapterError && error.code === "not_found") {
        skipped++;
        continue;
      }
      failed++;
    }
  }

  return {
    scanned: mappings.length,
    written,
    snapshotted,
    skipped,
    failed,
    rateLimited,
    touchedGames: [...touchedGamesById.values()],
  };
}
