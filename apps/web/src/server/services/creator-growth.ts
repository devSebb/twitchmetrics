import { Platform, prisma } from "@twitchmetrics/database";

type SnapshotPoint = {
  snapshotAt: Date;
  followerCount: bigint | null;
};

type GrowthRollupData = {
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

function findClosestSnapshot(
  snapshots: SnapshotPoint[],
  targetDate: Date,
  toleranceDays: number,
): SnapshotPoint | null {
  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
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

function pctChange(current: bigint | null, base: bigint | null): number {
  if (!current || !base || base === 0n) return 0;
  return (Number(current - base) / Number(base)) * 100;
}

function determineTrend(pct7d: number): string {
  if (pct7d > 0.5) return "UP";
  if (pct7d < -0.5) return "DOWN";
  return "FLAT";
}

function determineAcceleration(pct7d: number, prevPct7d: number): string {
  const diff = pct7d - prevPct7d;
  if (diff > 0.5) return "ACCELERATING";
  if (diff < -0.5) return "DECELERATING";
  return "STABLE";
}

async function computeGrowthRollup(
  creatorProfileId: string,
  platform: Platform,
): Promise<GrowthRollupData | null> {
  const now = new Date();
  const snapshots = await prisma.metricSnapshot.findMany({
    where: { creatorProfileId, platform },
    orderBy: { snapshotAt: "desc" },
    take: 200,
    select: {
      snapshotAt: true,
      followerCount: true,
    },
  });

  if (snapshots.length === 0) return null;

  const latest = snapshots[0]!;
  const latestFollowers = latest.followerCount ?? 0n;

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

  const snap1d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    1,
  );
  const snap7d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    2,
  );
  const snap14d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
    2,
  );
  const snap30d = findClosestSnapshot(
    snapshots,
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    3,
  );

  const delta1d = snap1d ? latestFollowers - (snap1d.followerCount ?? 0n) : 0n;
  const delta7d = snap7d ? latestFollowers - (snap7d.followerCount ?? 0n) : 0n;
  const delta30d = snap30d
    ? latestFollowers - (snap30d.followerCount ?? 0n)
    : 0n;

  const pct1d = pctChange(latestFollowers, snap1d?.followerCount ?? null);
  const pct7d = pctChange(latestFollowers, snap7d?.followerCount ?? null);
  const pct30d = pctChange(latestFollowers, snap30d?.followerCount ?? null);

  const prevPct7d =
    snap7d && snap14d
      ? pctChange(snap7d.followerCount, snap14d.followerCount)
      : 0;

  return {
    followerCount: latestFollowers,
    delta1d,
    delta7d,
    delta30d,
    pct1d: Math.round(pct1d * 100) / 100,
    pct7d: Math.round(pct7d * 100) / 100,
    pct30d: Math.round(pct30d * 100) / 100,
    trendDirection: determineTrend(pct7d),
    acceleration: determineAcceleration(pct7d, prevPct7d),
  };
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
