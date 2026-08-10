import { Prisma, type Platform } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { buildMeta } from "@/app/api/_lib/pagination";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import {
  DISCOVERABLE_CREATOR_SQL,
  DISCOVERABLE_CREATOR_WHERE,
} from "@/server/services/creator-visibility";
import { isKnownGrowthRollup } from "@/server/services/creator-growth";
import { MAX_PLAUSIBLE_PCT_7D } from "@/server/services/trending";
import {
  getStreamingStatsBatch,
  emptyStreamingStats,
} from "@/server/services/creator-streaming-stats";
import {
  getViewershipRankedIds,
  hasViewershipData,
  isViewershipSort,
  type GameFilter,
} from "@/server/services/creator-ranking";

/**
 * The single implementation behind both /creators (server render) and
 * GET /api/creators (the client refetch that CreatorGrid issues on every
 * filter click).
 *
 * These two used to be separate copies of the same SQL and had drifted:
 * the API's trending subquery was missing both the MAX_PLAUSIBLE_PCT_7D
 * guard and the ORDER BY computedAt DESC, so the server-rendered trending
 * list and the list the client fetched a moment later were ranked
 * differently. The page's (correct) version is what survives here.
 *
 * The API path already cached its result in Redis; the page path did not
 * and re-ran the raw SQL on every request. Caching lives here now, so both
 * callers share one cache entry — which also means CreatorGrid's duplicate
 * fetch usually lands on a warm key instead of the database.
 *
 * Everything served here is public, anonymous data (listed, unmerged
 * profiles only), so a shared cache key carries no per-user state.
 */

export type CreatorListSort =
  | "followers"
  | "viewership"
  | "peak"
  | "trending"
  | "recent";

export type CreatorListParams = {
  page: number;
  limit: number;
  sort: CreatorListSort;
  platform: Platform | null;
  /** Already resolved against the Game table; unknown slugs arrive as null. */
  game: GameFilter | null;
  query: string | null;
  view: "grid" | "list";
};

export type CreatorListItem = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  primaryPlatform: Platform;
  totalFollowers: string;
  displayFollowers: string;
  state: string;
  snapshotTier: string;
  platformAccounts: Array<{
    platform: Platform;
    platformUsername: string;
    followerCount: string;
  }>;
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
  airTimeSeconds?: number | null;
  avgAirTimeSeconds?: number | null;
  peakViewers?: number | null;
  avgViewers?: number | null;
};

export type CreatorListResult = {
  data: CreatorListItem[];
  meta: ReturnType<typeof buildMeta>;
};

type CreatorIdRow = { id: string };
type TotalRow = { total: bigint };

/**
 * Cache key. `game` is the resolved slug rather than the raw ?game= value so
 * unknown/garbage slugs (already normalised to null) cannot spray distinct
 * keys into Redis. `view` splits list/grid because list responses carry the
 * extra streaming-stat fields.
 */
function cacheKeyFor(params: CreatorListParams): string {
  return [
    "creators:list:v7",
    `p${params.page}`,
    `l${params.limit}`,
    `s${params.sort}`,
    `q${params.query ?? ""}`,
    `pl${params.platform ?? ""}`,
    `g${params.game?.slug ?? ""}`,
    `v${params.view}`,
  ].join(":");
}

// Platform filtering joins PlatformAccount (unique on creatorProfileId +
// platform, so no row fanout) so ranking can use that platform's own count
// instead of the cross-platform total.
function buildPlatformJoin(platform: Platform | null): Prisma.Sql {
  if (!platform) return Prisma.empty;
  return Prisma.sql`
    JOIN "PlatformAccount" pa
      ON pa."creatorProfileId" = cp.id
     AND pa.platform = ${platform}::"Platform"
  `;
}

function buildWhereClause(query: string | null, game: GameFilter | null) {
  const conditions: Prisma.Sql[] = [DISCOVERABLE_CREATOR_SQL];

  if (query) {
    conditions.push(
      Prisma.sql`(cp."searchText" % ${query} OR cp."searchText" ILIKE '%' || ${query} || '%')`,
    );
  }

  if (game) {
    conditions.push(Prisma.sql`cp."primaryGameSlug" = ${game.slug}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function getOrderClause(
  sort: CreatorListSort,
  platform: Platform | null,
): Prisma.Sql {
  // YouTube stores audience size in subscriberCount, others in followerCount.
  // The COALESCE + DESC NULLS LAST shape here is what
  // PlatformAccount_platform_audience_idx is built to match — changing
  // either side of that pair reintroduces a 578k-row seq scan.
  const platformFollowersSql = Prisma.sql`COALESCE(pa."followerCount", pa."subscriberCount")`;

  if (sort === "trending") {
    return Prisma.sql`
      ORDER BY COALESCE(
        (
          SELECT cgr."delta7d"
          FROM "CreatorGrowthRollup" cgr
          WHERE cgr."creatorProfileId" = cp.id
            AND cgr.platform = ${platform ? Prisma.sql`${platform}::"Platform"` : Prisma.sql`cp."primaryPlatform"`}
            AND (cgr."pct7d" IS NULL OR cgr."pct7d" <= ${MAX_PLAUSIBLE_PCT_7D})
          ORDER BY cgr."computedAt" DESC
          LIMIT 1
        ),
        0
      ) DESC, ${platform ? Prisma.sql`${platformFollowersSql} DESC NULLS LAST` : Prisma.sql`cp."totalFollowers" DESC`}
    `;
  }

  if (sort === "recent") {
    return Prisma.sql`ORDER BY cp."createdAt" DESC`;
  }

  return platform
    ? Prisma.sql`ORDER BY ${platformFollowersSql} DESC NULLS LAST, cp."totalFollowers" DESC`
    : Prisma.sql`ORDER BY cp."totalFollowers" DESC`;
}

/**
 * Viewership/peak rank from Stream Hatchet daily rollups. Platforms without
 * stream data (instagram/tiktok/x) have no viewership ranking, and the
 * ranked candidate set ignores free text, so both cases fall back to the
 * followers ordering.
 */
function resolveEffectiveSort(params: CreatorListParams): {
  sort: CreatorListSort;
  useViewershipRanking: boolean;
} {
  const useViewershipRanking =
    isViewershipSort(params.sort) &&
    hasViewershipData(params.platform) &&
    !params.query;

  if (useViewershipRanking) {
    return { sort: params.sort, useViewershipRanking: true };
  }

  return {
    sort: isViewershipSort(params.sort) ? "followers" : params.sort,
    useViewershipRanking: false,
  };
}

export async function listPublicCreators(
  params: CreatorListParams,
): Promise<CreatorListResult> {
  const cacheKey = cacheKeyFor(params);
  const cached = await cacheGet<CreatorListResult>(cacheKey);
  if (cached) return cached;

  const result = await queryPublicCreators(params);
  await cacheSet(cacheKey, result, CACHE_TTL.CREATOR_LIST);
  return result;
}

async function queryPublicCreators(
  params: CreatorListParams,
): Promise<CreatorListResult> {
  const { page, limit, platform, game, query, view } = params;
  const skip = (page - 1) * limit;
  const { sort, useViewershipRanking } = resolveEffectiveSort(params);

  const joinClause = buildPlatformJoin(platform);
  const whereClause = buildWhereClause(query, game);

  const [idRows, totalRows] = await Promise.all([
    useViewershipRanking && isViewershipSort(sort)
      ? getViewershipRankedIds({
          sort,
          platform: platform ?? undefined,
          gameName: game?.name ?? null,
          take: limit,
          skip,
        }).then((ids) => ids.map((id) => ({ id })))
      : db.$queryRaw<CreatorIdRow[]>(Prisma.sql`
          SELECT cp.id
          FROM "CreatorProfile" cp
          ${joinClause}
          ${whereClause}
          ${getOrderClause(sort, platform)}
          LIMIT ${limit}
          OFFSET ${skip}
        `),
    db.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "CreatorProfile" cp
      ${joinClause}
      ${whereClause}
    `),
  ]);

  const ids = idRows.map((row) => row.id);
  const total = Number(totalRows[0]?.total ?? 0n);

  if (!ids.length) {
    return { data: [], meta: buildMeta(total, page, limit) };
  }

  const creators = await db.creatorProfile.findMany({
    where: { ...DISCOVERABLE_CREATOR_WHERE, id: { in: ids } },
    select: {
      id: true,
      displayName: true,
      slug: true,
      avatarUrl: true,
      primaryPlatform: true,
      totalFollowers: true,
      state: true,
      snapshotTier: true,
      platformAccounts: {
        select: {
          platform: true,
          platformUsername: true,
          followerCount: true,
          subscriberCount: true,
        },
      },
      growthRollups: {
        orderBy: { computedAt: "desc" },
        select: {
          platform: true,
          delta7d: true,
          pct7d: true,
          trendDirection: true,
        },
      },
    },
  });

  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
  const data = ids
    .map((id) => creatorById.get(id))
    .filter((creator): creator is NonNullable<typeof creator> =>
      Boolean(creator),
    )
    .map((creator): CreatorListItem => {
      // On a platform tab, trend and follower count both come from that
      // platform (matching the sort); no cross-platform fallback.
      const rollupRow = platform
        ? (creator.growthRollups.find(
            (rollup) => rollup.platform === platform,
          ) ?? null)
        : (creator.growthRollups.find(
            (rollup) => rollup.platform === creator.primaryPlatform,
          ) ??
          creator.growthRollups[0] ??
          null);
      // Null delta7d means "no comparison snapshot" — treat as no rollup so
      // the UI renders missing data instead of a fake flat 0 trend.
      const growthRollup =
        rollupRow && isKnownGrowthRollup(rollupRow) ? rollupRow : null;

      const platformAccount = platform
        ? creator.platformAccounts.find(
            (account) => account.platform === platform,
          )
        : undefined;
      const displayFollowers = platformAccount
        ? (platformAccount.followerCount ??
          platformAccount.subscriberCount ??
          0n)
        : creator.totalFollowers;

      return {
        id: creator.id,
        displayName: creator.displayName,
        slug: creator.slug,
        avatarUrl: creator.avatarUrl,
        primaryPlatform: creator.primaryPlatform,
        totalFollowers: creator.totalFollowers.toString(),
        displayFollowers: displayFollowers.toString(),
        state: creator.state,
        snapshotTier: creator.snapshotTier,
        platformAccounts: creator.platformAccounts.map((account) => ({
          platform: account.platform,
          platformUsername: account.platformUsername,
          followerCount: account.followerCount?.toString() ?? "0",
        })),
        growthRollup: growthRollup
          ? {
              delta7d: growthRollup.delta7d.toString(),
              pct7d: growthRollup.pct7d,
              trendDirection: growthRollup.trendDirection,
            }
          : null,
      };
    });

  if (view === "list") {
    const statsById = await getStreamingStatsBatch(ids);
    for (const row of data) {
      const stats = statsById.get(row.id) ?? emptyStreamingStats();
      Object.assign(row, stats);
    }
  }

  return serializeBigInt({ data, meta: buildMeta(total, page, limit) });
}
