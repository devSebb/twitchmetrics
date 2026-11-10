import { Prisma, prisma } from "@twitchmetrics/database";
import { TIER_CONFIG } from "./tiers";

/** Anything that can run raw SQL: the shared client, a worker's own PrismaClient, or a transaction. */
export type AggregatesDb = Pick<Prisma.TransactionClient, "$executeRaw">;

const DEFAULT_CHUNK = 1000;

/**
 * One set-based UPDATE that recomputes a batch of profiles' aggregates from
 * their tracked platform accounts:
 * - totalFollowers: every account on the profile, link-only ones included,
 *   so the total equals the sum of the platforms the creator header shows
 *   (NULL counts as 0), plus each account's otherChannelsFollowerCount (the
 *   creator's other channels on that platform). Stream Hatchet's BI adds
 *   everything up the same way;
 *   until 2026-11 social links were left out, so ibai showed 37.7M next to
 *   five platforms adding up to 99.7M.
 * - snapshotTier: from the tracked accounts only (TIER_CONFIG thresholds).
 *   The tier decides how often we poll, and link-only accounts
 *   (discoverySource != null, e.g. Stream Hatchet IG/TikTok/X links) are
 *   never polled, so they must not raise it.
 * - totalViews / lastSnapshotAt: tracked accounts only.
 *
 * Profiles with no accounts are reset to 0 / NULL / tier3 (LEFT JOIN).
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
          WHEN agg.tracked_followers >= ${TIER_CONFIG.tier1.followerThreshold} THEN 'tier1'
          WHEN agg.tracked_followers >= ${TIER_CONFIG.tier2.followerThreshold} THEN 'tier2'
          ELSE 'tier3'
        END)::"SnapshotTier"
    FROM (
      SELECT cp.id,
             COALESCE(SUM(COALESCE(a."followerCount", 0) + COALESCE(a."otherChannelsFollowerCount", 0)), 0) AS total_followers,
             COALESCE(SUM(a."followerCount") FILTER (WHERE a."discoverySource" IS NULL), 0) AS tracked_followers,
             COALESCE(SUM(a."totalViews") FILTER (WHERE a."discoverySource" IS NULL), 0) AS total_views,
             MAX(a."lastSyncedAt") FILTER (WHERE a."discoverySource" IS NULL) AS last_synced_at
      FROM "CreatorProfile" cp
      LEFT JOIN "PlatformAccount" a ON a."creatorProfileId" = cp.id
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
