import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { cacheGet, cacheSet, CACHE_TTL } from "./cache";
import { createLogger } from "@/lib/logger";

const log = createLogger("trending");

const CACHE_KEY = "trending:landing";

export type TrendingCreator = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  totalFollowers: string;
  delta7d: string;
  followerPct7d: number;
  trendDirection: string;
  primaryPlatform: string;
};

type Row = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  totalFollowers: bigint;
  primaryPlatform: string;
  delta7d: bigint;
  pct7d: number | null;
  trendDirection: string | null;
};

/**
 * Returns trending creators ordered by absolute 7-day follower gain on their
 * primary platform — mirrors the `/api/creators?sort=trending` ranking so the
 * landing card matches what users see in the browse "Trending" filter.
 *
 * Floors: delta7d > 100 and totalFollowers > 500 to keep tiny-base outliers out.
 * Results are cached for 10 minutes.
 */
export async function getTrendingCreators(
  limit = 9,
): Promise<TrendingCreator[]> {
  const cached = await cacheGet<TrendingCreator[]>(CACHE_KEY);
  if (cached) return cached;

  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT cp.id,
           cp.slug,
           cp."displayName",
           cp."avatarUrl",
           cp."totalFollowers",
           cp."primaryPlatform"::text AS "primaryPlatform",
           COALESCE(r."delta7d", 0) AS "delta7d",
           r."pct7d",
           r."trendDirection"::text AS "trendDirection"
    FROM "CreatorProfile" cp
    LEFT JOIN LATERAL (
      SELECT cgr."delta7d", cgr."pct7d", cgr."trendDirection"
      FROM "CreatorGrowthRollup" cgr
      WHERE cgr."creatorProfileId" = cp.id
        AND cgr.platform = cp."primaryPlatform"
      LIMIT 1
    ) r ON true
    WHERE cp."totalFollowers" > 500
      AND COALESCE(r."delta7d", 0) > 100
    ORDER BY COALESCE(r."delta7d", 0) DESC, cp."totalFollowers" DESC
    LIMIT ${limit}
  `);

  const trending: TrendingCreator[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    totalFollowers: r.totalFollowers.toString(),
    delta7d: r.delta7d.toString(),
    followerPct7d: r.pct7d ?? 0,
    trendDirection: r.trendDirection ?? "FLAT",
    primaryPlatform: r.primaryPlatform,
  }));

  await cacheSet(CACHE_KEY, trending, CACHE_TTL.TRENDING_LANDING);

  log.info({ count: trending.length }, "Trending creators computed");
  return trending;
}
