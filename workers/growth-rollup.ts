/**
 * Growth Rollup Worker
 *
 * Standalone script that computes growth metrics (1d/7d/30d deltas)
 * from MetricSnapshot data and upserts into CreatorGrowthRollup.
 *
 * The delta math lives in the shared service
 * (apps/web/src/server/services/creator-growth.ts) so this worker and the
 * post-snapshot recompute hook can never drift. Semantics:
 *   - No snapshots → skipped (no row)
 *   - Missing comparison snapshot within tolerance → delta/pct = null (unknown)
 *   - Stale data (>48h) and outliers (>50% jump) logged as warnings
 *
 * Usage:
 *   tsx workers/growth-rollup.ts                  # Full run
 *   tsx workers/growth-rollup.ts --dry-run        # Compute without writing
 *   tsx workers/growth-rollup.ts --limit 50       # Process at most 50 creators
 */

import { PrismaClient } from "@prisma/client";
import { computeGrowthFromSnapshots } from "../apps/web/src/server/services/creator-growth";

// ============================================================
// CONFIGURATION
// ============================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 0;
})();

const BATCH_SIZE = 50;
const prisma = new PrismaClient();

// ============================================================
// LOGGING (lightweight — workers don't use pino)
// ============================================================

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  const prefix = `[growth-rollup] [${level.toUpperCase()}]`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Detect outlier: >50% change from previous value.
 */
function isOutlier(current: bigint, previous: bigint): boolean {
  if (previous === 0n) return false;
  const changePct =
    Math.abs(Number(current - previous) / Number(previous)) * 100;
  return changePct > 50;
}

// ============================================================
// ROLLUP COMPUTATION
// ============================================================

async function computeRollup(creatorProfileId: string, platform: string) {
  const snapshots = await prisma.metricSnapshot.findMany({
    where: { creatorProfileId, platform: platform as never },
    orderBy: { snapshotAt: "desc" },
    take: 200, // Enough for 30d lookback
    select: {
      snapshotAt: true,
      followerCount: true,
    },
  });

  if (snapshots.length === 0) return null;

  const latest = snapshots[0]!;

  // Stale data detection
  const hoursSinceLastSnapshot =
    (Date.now() - latest.snapshotAt.getTime()) / (60 * 60 * 1000);
  if (hoursSinceLastSnapshot > 48) {
    log("warn", "Stale data detected", {
      creatorProfileId,
      platform,
      hoursSinceLastSnapshot: Math.round(hoursSinceLastSnapshot),
    });
  }

  // Outlier check against most recent previous snapshot; the outlier is still
  // stored in MetricSnapshot for admin review.
  const previous = snapshots[1];
  if (
    previous &&
    latest.followerCount &&
    previous.followerCount &&
    isOutlier(latest.followerCount, previous.followerCount)
  ) {
    log("warn", "Outlier detected — >50% follower change", {
      creatorProfileId,
      platform,
      current: latest.followerCount.toString(),
      previous: previous.followerCount.toString(),
    });
  }

  return computeGrowthFromSnapshots(snapshots);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log("info", "Starting growth rollup worker", { DRY_RUN, LIMIT });

  // Get all creators with their platform accounts
  const creators = await prisma.creatorProfile.findMany({
    select: {
      id: true,
      slug: true,
      displayName: true,
      platformAccounts: {
        select: { platform: true },
      },
    },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  log("info", `Found ${creators.length} creators to process`);

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < creators.length; i += BATCH_SIZE) {
    const batch = creators.slice(i, i + BATCH_SIZE);

    for (const creator of batch) {
      // Get unique platforms for this creator
      const platforms = [
        ...new Set(creator.platformAccounts.map((a) => a.platform)),
      ];

      for (const platform of platforms) {
        try {
          const rollup = await computeRollup(creator.id, platform);

          if (!rollup) {
            skipped++;
            continue;
          }

          if (DRY_RUN) {
            log("info", "DRY RUN — would upsert rollup", {
              slug: creator.slug,
              platform,
              followerCount: rollup.followerCount.toString(),
              delta7d: rollup.delta7d?.toString() ?? null,
              pct7d: rollup.pct7d,
              trend: rollup.trendDirection,
              acceleration: rollup.acceleration,
            });
          } else {
            await prisma.creatorGrowthRollup.upsert({
              where: {
                creatorProfileId_platform: {
                  creatorProfileId: creator.id,
                  platform: platform as never,
                },
              },
              update: {
                followerCount: rollup.followerCount,
                delta1d: rollup.delta1d,
                delta7d: rollup.delta7d,
                delta30d: rollup.delta30d,
                pct1d: rollup.pct1d,
                pct7d: rollup.pct7d,
                pct30d: rollup.pct30d,
                trendDirection: rollup.trendDirection,
                acceleration: rollup.acceleration,
                computedAt: new Date(),
              },
              create: {
                creatorProfileId: creator.id,
                platform: platform as never,
                followerCount: rollup.followerCount,
                delta1d: rollup.delta1d,
                delta7d: rollup.delta7d,
                delta30d: rollup.delta30d,
                pct1d: rollup.pct1d,
                pct7d: rollup.pct7d,
                pct30d: rollup.pct30d,
                trendDirection: rollup.trendDirection,
                acceleration: rollup.acceleration,
              },
            });
          }

          processed++;
        } catch (err) {
          errors++;
          log("error", "Failed to compute rollup", {
            creatorProfileId: creator.id,
            platform,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Brief pause between batches
    if (i + BATCH_SIZE < creators.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  log("info", "Growth rollup worker complete", {
    processed,
    errors,
    skipped,
    total: creators.length,
  });
}

main()
  .catch((err) => {
    log("error", "Worker failed", { error: String(err) });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
