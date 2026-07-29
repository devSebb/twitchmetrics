import { Platform, prisma } from "@twitchmetrics/database";

export type SnapshotPoint = {
  snapshotAt: Date;
  followerCount: bigint | null;
};

/**
 * Null delta/pct = "no comparison snapshot within tolerance" — unknown, not
 * flat. This is the single growth-computation implementation; the standalone
 * worker (workers/growth-rollup.ts) imports it too, so the two can't drift.
 */
export type GrowthRollupData = {
  followerCount: bigint;
  delta1d: bigint | null;
  delta7d: bigint | null;
  delta30d: bigint | null;
  pct1d: number | null;
  pct7d: number | null;
  pct30d: number | null;
  trendDirection: string;
  acceleration: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A rollup row is "known" when its 7d comparison actually existed. Unknown
 * rows (null delta/pct) must serialize as missing data, never as a flat 0
 * trend — public surfaces filter through this guard.
 */
export function isKnownGrowthRollup<
  T extends { delta7d: bigint | null; pct7d: number | null },
>(rollup: T): rollup is T & { delta7d: bigint; pct7d: number } {
  return rollup.delta7d !== null && rollup.pct7d !== null;
}

export function findClosestSnapshot(
  snapshots: SnapshotPoint[],
  targetDate: Date,
  toleranceDays: number,
): SnapshotPoint | null {
  const toleranceMs = toleranceDays * DAY_MS;
  const targetMs = targetDate.getTime();

  let closest: SnapshotPoint | null = null;
  let closestDiff = Number.POSITIVE_INFINITY;

  for (const snapshot of snapshots) {
    const diff = Math.abs(snapshot.snapshotAt.getTime() - targetMs);
    if (diff <= toleranceMs && diff < closestDiff) {
      closest = snapshot;
      closestDiff = diff;
    }
  }

  return closest;
}

/** Percentage change; null when the base is missing or zero (unknown). */
export function pctChange(
  current: bigint | null,
  base: bigint | null,
): number | null {
  if (current === null || base === null || base === 0n) return null;
  return (Number(current - base) / Number(base)) * 100;
}

function roundPct(pct: number | null): number | null {
  return pct === null ? null : Math.round(pct * 100) / 100;
}

/** Trend from the 7d pct; unknown pct reads as FLAT for ranking stability. */
export function determineTrend(pct7d: number | null): string {
  if (pct7d === null) return "FLAT";
  if (pct7d > 0.5) return "UP";
  if (pct7d < -0.5) return "DOWN";
  return "FLAT";
}

export function determineAcceleration(
  pct7d: number | null,
  prevPct7d: number | null,
): string {
  if (pct7d === null || prevPct7d === null) return "STABLE";
  const diff = pct7d - prevPct7d;
  if (diff > 0.5) return "ACCELERATING";
  if (diff < -0.5) return "DECELERATING";
  return "STABLE";
}

/**
 * Pure growth computation over a creator+platform's snapshots (newest
 * first). Returns null when there are no snapshots at all; deltas/pcts are
 * null when the comparison snapshot for that window is missing.
 */
export function computeGrowthFromSnapshots(
  snapshots: SnapshotPoint[],
  now: Date = new Date(),
): GrowthRollupData | null {
  if (snapshots.length === 0) return null;

  const latest = snapshots[0]!;
  const latestFollowers = latest.followerCount ?? 0n;

  if (snapshots.length < 2) {
    // A single observation cannot support any delta — all unknown.
    return {
      followerCount: latestFollowers,
      delta1d: null,
      delta7d: null,
      delta30d: null,
      pct1d: null,
      pct7d: null,
      pct30d: null,
      trendDirection: "FLAT",
      acceleration: "STABLE",
    };
  }

  const snap1d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 1 * DAY_MS),
    1,
  );
  const snap7d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 7 * DAY_MS),
    2,
  );
  const snap14d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 14 * DAY_MS),
    2,
  );
  const snap30d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 30 * DAY_MS),
    3,
  );

  const deltaFrom = (base: SnapshotPoint | null): bigint | null =>
    base && base.followerCount !== null
      ? latestFollowers - base.followerCount
      : null;

  const pct1d = pctChange(latestFollowers, snap1d?.followerCount ?? null);
  const pct7d = pctChange(latestFollowers, snap7d?.followerCount ?? null);
  const pct30d = pctChange(latestFollowers, snap30d?.followerCount ?? null);

  const prevPct7d =
    snap7d && snap14d
      ? pctChange(snap7d.followerCount, snap14d.followerCount)
      : null;

  return {
    followerCount: latestFollowers,
    delta1d: deltaFrom(snap1d),
    delta7d: deltaFrom(snap7d),
    delta30d: deltaFrom(snap30d),
    pct1d: roundPct(pct1d),
    pct7d: roundPct(pct7d),
    pct30d: roundPct(pct30d),
    trendDirection: determineTrend(pct7d),
    acceleration: determineAcceleration(pct7d, prevPct7d),
  };
}

async function computeGrowthRollup(
  creatorProfileId: string,
  platform: Platform,
): Promise<GrowthRollupData | null> {
  const snapshots = await prisma.metricSnapshot.findMany({
    where: { creatorProfileId, platform },
    orderBy: { snapshotAt: "desc" },
    take: 200,
    select: {
      snapshotAt: true,
      followerCount: true,
    },
  });

  return computeGrowthFromSnapshots(snapshots);
}

export async function recomputeCreatorGrowthRollups(
  creatorProfileId: string,
  platforms: Platform[],
): Promise<number> {
  let updated = 0;

  for (const platform of [...new Set(platforms)]) {
    const rollup = await computeGrowthRollup(creatorProfileId, platform);

    if (!rollup) {
      continue;
    }

    await prisma.creatorGrowthRollup.upsert({
      where: {
        creatorProfileId_platform: {
          creatorProfileId,
          platform,
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
        creatorProfileId,
        platform,
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

    updated++;
  }

  return updated;
}
