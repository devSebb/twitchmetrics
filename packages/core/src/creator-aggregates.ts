import { Prisma, prisma } from "@twitchmetrics/database";
import { TIER_CONFIG } from "./tiers";

/** Anything that can run raw SQL: the shared client, a worker's own PrismaClient, or a transaction. */
export type AggregatesDb = Pick<Prisma.TransactionClient, "$executeRaw">;

const DEFAULT_CHUNK = 1000;

/**
 * One set-based UPDATE that recomputes a batch of profiles' aggregates from
 * their tracked platform accounts:
 * - totalFollowers / totalViews: sums over accounts (NULL counts as 0)
 * - lastSnapshotAt: latest account lastSyncedAt (NULL when none synced)
 * - snapshotTier: from TIER_CONFIG follower thresholds
 *
 * Link-only social accounts (discoverySource != null, e.g. StreamHatchet
 * IG/TikTok/X links) are excluded: their follower counts are stored for
 * display but must not inflate totalFollowers or the snapshot tier. Profiles
 * with no tracked accounts are reset to 0 / NULL / tier3 (LEFT JOIN).
 */
export function buildRecomputeAggregatesSql(
  ids: readonly string[],
): Prisma.Sql {
  return Prisma.sql`
    UPDATE "CreatorProfile" AS p
    SET "totalFollowers" = agg.total_followers,
        "totalViews" = agg.total_views,
        "lastSnapshotAt" = agg.last_synced_at,
        "snapshotTier" = (CASE
          WHEN agg.total_followers >= ${TIER_CONFIG.tier1.followerThreshold} THEN 'tier1'
          WHEN agg.total_followers >= ${TIER_CONFIG.tier2.followerThreshold} THEN 'tier2'
          ELSE 'tier3'
        END)::"SnapshotTier"
    FROM (
      SELECT cp.id,
             COALESCE(SUM(a."followerCount"), 0) AS total_followers,
             COALESCE(SUM(a."totalViews"), 0) AS total_views,
             MAX(a."lastSyncedAt") AS last_synced_at
      FROM "CreatorProfile" cp
      LEFT JOIN "PlatformAccount" a
        ON a."creatorProfileId" = cp.id AND a."discoverySource" IS NULL
      WHERE cp.id = ANY(${[...ids]}::uuid[])
      GROUP BY cp.id
    ) AS agg
    WHERE p.id = agg.id
  `;
}

/** Recompute aggregates for many profiles; returns the number of profiles updated. */
export async function recomputeCreatorAggregatesMany(
  ids: readonly string[],
  opts: { db?: AggregatesDb; chunk?: number } = {},
): Promise<number> {
  const db = opts.db ?? prisma;
  const chunk = opts.chunk ?? DEFAULT_CHUNK;
  const unique = [...new Set(ids)];
  let updated = 0;
  for (let i = 0; i < unique.length; i += chunk) {
    updated += await db.$executeRaw(
      buildRecomputeAggregatesSql(unique.slice(i, i + chunk)),
    );
  }
  return updated;
}

export async function recomputeCreatorAggregates(
  creatorProfileId: string,
  db: AggregatesDb = prisma,
): Promise<void> {
  await recomputeCreatorAggregatesMany([creatorProfileId], { db });
}
