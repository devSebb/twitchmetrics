import type { Platform } from "@twitchmetrics/database";
import { db } from "@/server/db";
import {
  RANKING_PAGE_DEPTH,
  RANKING_WINDOW_DAYS,
  type CategoryMetric,
  type CategoryRankingStats,
  type CreatorMetric,
  type CreatorRankingStats,
  type RankingScope,
} from "@/lib/rankings";

/**
 * Reads of the published rankings (RankingEntry). Everything here is a short
 * indexed read of rows workers/build-rankings.ts wrote: no ranking is computed
 * at request time, so a page costs the same whatever it ranks.
 */

export type RankingMovement =
  /** No earlier ranking to compare with (column shows nothing). */
  | { kind: "none" }
  /** Was outside last period's stored ranking. */
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "up" | "down"; places: number };

export type CreatorRankingRow = {
  rank: number;
  movement: RankingMovement;
  value: number;
  previousValue: number | null;
  stats: CreatorRankingStats;
  creator: {
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    primaryPlatform: Platform;
    primaryGameName: string | null;
    platforms: Platform[];
  };
};

export type CategoryRankingRow = {
  rank: number;
  movement: RankingMovement;
  value: number;
  stats: CategoryRankingStats;
  game: { slug: string; name: string; coverImageUrl: string | null };
};

export type Ranking<Row> = {
  rows: Row[];
  /** Last UTC day of the window. */
  windowEnd: Date;
  computedAt: Date;
};

function movementOf(entry: {
  rank: number;
  previousRank: number | null;
  hasPrevious: boolean;
}): RankingMovement {
  if (!entry.hasPrevious) return { kind: "none" };
  if (entry.previousRank == null) return { kind: "new" };
  const places = entry.previousRank - entry.rank;
  if (places === 0) return { kind: "same" };
  return { kind: places > 0 ? "up" : "down", places: Math.abs(places) };
}

async function latestWindowEnd(where: {
  kind: string;
  scope: string;
  metric: string;
  gameSlug: string;
}): Promise<Date | null> {
  const latest = await db.rankingEntry.findFirst({
    where: { ...where, windowDays: RANKING_WINDOW_DAYS },
    orderBy: { windowEnd: "desc" },
    select: { windowEnd: true },
  });
  return latest?.windowEnd ?? null;
}

export async function getCreatorRanking(opts: {
  scope: RankingScope;
  metric: CreatorMetric;
  gameSlug?: string;
  limit?: number;
}): Promise<Ranking<CreatorRankingRow> | null> {
  const where = {
    kind: "creator",
    scope: opts.scope,
    metric: opts.metric,
    gameSlug: opts.gameSlug ?? "",
  };
  const windowEnd = await latestWindowEnd(where);
  if (!windowEnd) return null;

  const entries = await db.rankingEntry.findMany({
    where: {
      ...where,
      windowDays: RANKING_WINDOW_DAYS,
      windowEnd,
      rank: { lte: opts.limit ?? RANKING_PAGE_DEPTH },
      // A profile merged or unlisted since the build drops out.
      creatorProfile: { listed: true, mergedIntoId: null },
    },
    orderBy: { rank: "asc" },
    select: {
      rank: true,
      previousRank: true,
      hasPrevious: true,
      value: true,
      previousValue: true,
      stats: true,
      computedAt: true,
      creatorProfile: {
        select: {
          slug: true,
          displayName: true,
          avatarUrl: true,
          primaryPlatform: true,
          primaryGameName: true,
          platformAccounts: { select: { platform: true } },
        },
      },
    },
  });
  const first = entries[0];
  if (!first) return null;

  return {
    windowEnd,
    computedAt: first.computedAt,
    rows: entries.flatMap((entry) => {
      const profile = entry.creatorProfile;
      if (!profile) return [];
      return [
        {
          rank: entry.rank,
          movement: movementOf(entry),
          value: entry.value,
          previousValue: entry.previousValue,
          stats: entry.stats as CreatorRankingStats,
          creator: {
            slug: profile.slug,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            primaryPlatform: profile.primaryPlatform,
            primaryGameName: profile.primaryGameName,
            platforms: [
              ...new Set(profile.platformAccounts.map((a) => a.platform)),
            ],
          },
        },
      ];
    }),
  };
}

export async function getCategoryRanking(opts: {
  metric: CategoryMetric;
  limit?: number;
}): Promise<Ranking<CategoryRankingRow> | null> {
  const where = {
    kind: "category",
    scope: "all-platforms",
    metric: opts.metric,
    gameSlug: "",
  };
  const windowEnd = await latestWindowEnd(where);
  if (!windowEnd) return null;

  const entries = await db.rankingEntry.findMany({
    where: {
      ...where,
      windowDays: RANKING_WINDOW_DAYS,
      windowEnd,
      rank: { lte: opts.limit ?? RANKING_PAGE_DEPTH },
    },
    orderBy: { rank: "asc" },
    select: {
      rank: true,
      previousRank: true,
      hasPrevious: true,
      value: true,
      stats: true,
      computedAt: true,
      game: { select: { slug: true, name: true, coverImageUrl: true } },
    },
  });
  const first = entries[0];
  if (!first) return null;

  return {
    windowEnd,
    computedAt: first.computedAt,
    rows: entries.flatMap((entry) =>
      entry.game
        ? [
            {
              rank: entry.rank,
              movement: movementOf(entry),
              value: entry.value,
              stats: entry.stats as CategoryRankingStats,
              game: entry.game,
            },
          ]
        : [],
    ),
  };
}

export type GameRankingLink = { slug: string; name: string };

/**
 * Games that have a "top creators" ranking today, most watched first. A game
 * only gets one when enough creators streamed it (see the worker), so links
 * built from this list never lead to an empty page.
 */
export async function listGameRankings(
  limit?: number,
): Promise<GameRankingLink[]> {
  const newest = await db.rankingEntry.findFirst({
    where: { kind: "creator", gameSlug: { not: "" } },
    orderBy: { windowEnd: "desc" },
    select: { windowEnd: true },
  });
  if (!newest) return [];
  const leaders = await db.rankingEntry.findMany({
    where: {
      kind: "creator",
      gameSlug: { not: "" },
      windowEnd: newest.windowEnd,
      windowDays: RANKING_WINDOW_DAYS,
      rank: 1,
    },
    select: { gameSlug: true },
  });
  const slugs = leaders.map((leader) => leader.gameSlug);
  if (slugs.length === 0) return [];

  // Order by the category ranking, which is "most watched game" already.
  const [games, order] = await Promise.all([
    db.game.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, name: true },
    }),
    db.rankingEntry.findMany({
      where: {
        kind: "category",
        metric: "most-watched",
        windowEnd: newest.windowEnd,
        windowDays: RANKING_WINDOW_DAYS,
      },
      select: { gameId: true, rank: true },
    }),
  ]);
  const rankOf = new Map(order.map((entry) => [entry.gameId, entry.rank]));
  const sorted = games
    .sort(
      (a, b) =>
        (rankOf.get(a.id) ?? Infinity) - (rankOf.get(b.id) ?? Infinity) ||
        a.name.localeCompare(b.name),
    )
    .map(({ slug, name }) => ({ slug, name }));
  return limit ? sorted.slice(0, limit) : sorted;
}

/** Whether a game has a published "top creators" ranking. */
export async function hasGameRanking(gameSlug: string): Promise<boolean> {
  const entry = await db.rankingEntry.findFirst({
    where: { kind: "creator", gameSlug, rank: 1 },
    select: { id: true },
  });
  return entry != null;
}
