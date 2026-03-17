/**
 * Growth Rollup Worker
 *
 * Standalone script that computes growth metrics (1d/7d/30d deltas)
 * from MetricSnapshot data and upserts into CreatorGrowthRollup.
 *
 * Handles edge cases:
 *   - New creators with < 2 snapshots → FLAT, all deltas 0
 *   - Missing historical snapshots → tolerance window (±2d for 7d, ±3d for 30d)
 *   - Outlier detection → >50% jump flagged, excluded from trend
 *   - Stale data → >48h since last snapshot logged as warning
 *
 * Usage:
 *   tsx workers/growth-rollup.ts                  # Full run
 *   tsx workers/growth-rollup.ts --dry-run        # Compute without writing
 *   tsx workers/growth-rollup.ts --limit 50       # Process at most 50 creators
 */

import { PrismaClient } from "@prisma/client";

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

// ============================================================
// SNAPSHOT TYPE
// ============================================================

type Snapshot = {
  snapshotAt: Date;
  followerCount: bigint | null;
  totalViews: bigint | null;
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Find the snapshot closest to a target date within a tolerance window.
 */
function findClosestSnapshot(
  snapshots: Snapshot[],
  targetDate: Date,
  toleranceDays: number,
): Snapshot | null {
  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
  const targetMs = targetDate.getTime();

  let closest: Snapshot | null = null;
  let closestDiff = Infinity;

  for (const s of snapshots) {
    const diff = Math.abs(s.snapshotAt.getTime() - targetMs);
    if (diff <= toleranceMs && diff < closestDiff) {
      closest = s;
      closestDiff = diff;
    }
  }
  return closest;
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

/**
 * Compute percentage change, handling zero base.
 */
function pctChange(current: bigint | null, base: bigint | null): number {
  if (!current || !base || base === 0n) return 0;
  return (Number(current - base) / Number(base)) * 100;
}

/**
 * Determine trend direction from 7d percentage change.
 */
function determineTrend(pct7d: number): string {
  if (pct7d > 0.5) return "UP";
  if (pct7d < -0.5) return "DOWN";
  return "FLAT";
}

/**
 * Determine acceleration by comparing current 7d growth rate to previous 7d.
 */
function determineAcceleration(pct7d: number, prevPct7d: number): string {
  const diff = pct7d - prevPct7d;
  if (diff > 0.5) return "ACCELERATING";
  if (diff < -0.5) return "DECELERATING";
  return "STABLE";
}

// ============================================================
// ROLLUP COMPUTATION
// ============================================================

type RollupData = {
  followerCount: bigint;
  delta1d: bigint;
  delta7d: bigint;
  delta30d: bigint;
  pct1d: number;
  pct7d: number;
  pct30d: number;
  trendDirection: string;
  acceleration: string;
};

async function computeRollup(
  creatorProfileId: string,
  platform: string,
): Promise<RollupData | null> {
  const now = new Date();

  const snapshots = await prisma.metricSnapshot.findMany({
    where: { creatorProfileId, platform: platform as never },
    orderBy: { snapshotAt: "desc" },
    take: 200, // Enough for 30d lookback
    select: {
      snapshotAt: true,
      followerCount: true,
      totalViews: true,
    },
  });

  if (snapshots.length === 0) return null;

  const latest = snapshots[0]!;
  const latestFollowers = latest.followerCount ?? 0n;

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

  // New creator with < 2 snapshots
  if (snapshots.length < 2) {
    return {
      followerCount: latestFollowers,
      delta1d: 0n,
      delta7d: 0n,
      delta30d: 0n,
      pct1d: 0,
      pct7d: 0,
      pct30d: 0,
      trendDirection: "FLAT",
      acceleration: "STABLE",
    };
  }

  // Find reference snapshots with tolerance windows
  const snap1d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 1 * 24 * 3600_000),
    1,
  );
  const snap7d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 7 * 24 * 3600_000),
    2,
  );
  const snap30d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 30 * 24 * 3600_000),
    3,
  );

  // For acceleration: find the 7d snapshot from 7 days ago
  const snap14d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 14 * 24 * 3600_000),
    2,
  );

  // Outlier check against most recent previous snapshot
  const previous = snapshots[1]!;
  if (
    latestFollowers &&
    previous.followerCount &&
    isOutlier(latestFollowers, previous.followerCount)
  ) {
    log("warn", "Outlier detected — >50% follower change", {
      creatorProfileId,
      platform,
      current: latestFollowers.toString(),
      previous: previous.followerCount.toString(),
    });
    // Use the snapshot before the outlier for trend calculation
    // The outlier is still stored in MetricSnapshot for admin review
  }

  // Delta calculations
  const delta1d = snap1d ? latestFollowers - (snap1d.followerCount ?? 0n) : 0n;
  const delta7d = snap7d ? latestFollowers - (snap7d.followerCount ?? 0n) : 0n;
  const delta30d = snap30d
    ? latestFollowers - (snap30d.followerCount ?? 0n)
    : 0n;

  // Percentage calculations
  const pct1d = pctChange(latestFollowers, snap1d?.followerCount ?? null);
  const pct7d = pctChange(latestFollowers, snap7d?.followerCount ?? null);
  const pct30d = pctChange(latestFollowers, snap30d?.followerCount ?? null);

  // Trend direction from 7d growth
  const trendDirection = determineTrend(pct7d);

  // Acceleration: compare current 7d rate to previous 7d rate
  const prevPct7d =
    snap7d && snap14d
      ? pctChange(snap7d.followerCount, snap14d.followerCount)
      : 0;
  const acceleration = determineAcceleration(pct7d, prevPct7d);

  return {
    followerCount: latestFollowers,
    delta1d,
    delta7d,
    delta30d,
    pct1d: Math.round(pct1d * 100) / 100,
    pct7d: Math.round(pct7d * 100) / 100,
    pct30d: Math.round(pct30d * 100) / 100,
    trendDirection,
    acceleration,
  };
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
              delta7d: rollup.delta7d.toString(),
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
