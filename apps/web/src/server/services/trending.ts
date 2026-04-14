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
  totalFollowers: string; // Serialized BigInt
  trendScore: number;
  followerPct7d: number;
  trendDirection: string;
  primaryPlatform: string;
};

/**
 * Returns trending creators sorted by a composite trend score.
 *
 * Score formula:
 *   trendScore = pct7d * 0.7 + (delta7d weight) * 0.3
 *
 * Uses the pre-computed CreatorGrowthRollup (never computes from raw snapshots).
 * Results are cached for 10 minutes.
 */
export async function getTrendingCreators(
  limit = 20,
): Promise<TrendingCreator[]> {
  // Check cache first
  const cached = await cacheGet<TrendingCreator[]>(CACHE_KEY);
  if (cached) return cached;

  // Query rollups with meaningful positive growth, deduplicated by creator.
  // Guards:
  //   delta7d > 100  — must have gained at least 100 absolute followers (filters near-zero base explosion)
  //   pct7d   > 0    — positive trend only
  //   creatorProfile.totalFollowers > 500 — must be a real creator with some audience
  const rollups = await db.creatorGrowthRollup.findMany({
    where: {
      pct7d: { gt: 0 },
      delta7d: { gt: 100 },
      creatorProfile: {
        totalFollowers: { gt: 500 },
      },
    },
    include: {
      creatorProfile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          avatarUrl: true,
          totalFollowers: true,
          primaryPlatform: true,
        },
      },
    },
    orderBy: { pct7d: "desc" },
    take: limit * 3, // Fetch extra to account for dedup
  });

  // Deduplicate by creator (a creator can have multiple platform rollups)
  const seenIds = new Set<string>();
  const trending: TrendingCreator[] = [];

  for (const r of rollups) {
    if (seenIds.has(r.creatorProfile.id)) continue;
    seenIds.add(r.creatorProfile.id);

    // Cap pct7d at 200% so no single outlier dominates via a near-zero base
    const cappedPct = Math.min(r.pct7d ?? 0, 200);
    const trendScore =
      cappedPct * 0.7 + Math.log10(Math.max(Number(r.delta7d), 1)) * 0.3;

    trending.push({
      id: r.creatorProfile.id,
      slug: r.creatorProfile.slug,
      displayName: r.creatorProfile.displayName,
      avatarUrl: r.creatorProfile.avatarUrl,
      totalFollowers: r.creatorProfile.totalFollowers.toString(),
      trendScore: Math.round(trendScore * 100) / 100,
      followerPct7d: r.pct7d ?? 0,
      trendDirection: r.trendDirection ?? "FLAT",
      primaryPlatform: r.creatorProfile.primaryPlatform,
    });

    if (trending.length >= limit) break;
  }

  // Sort by composite score
  trending.sort((a, b) => b.trendScore - a.trendScore);

  // Cache for 10 minutes
  await cacheSet(CACHE_KEY, trending, CACHE_TTL.TRENDING_LANDING);

  log.info({ count: trending.length }, "Trending creators computed");
  return trending;
}
