type SnapshotLike = {
  snapshotAt: Date;
  totalViewers: number;
  totalChannels: number;
};

type GameDerivedMetrics = {
  currentViewers: number;
  currentChannels: number;
  peakViewers24h: number;
  avgViewers7d: number;
  avgLiveChannels: number;
  hoursWatched7d: bigint;
};

const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Milliseconds each (time-ordered) snapshot stands for: the gap to the next
 * snapshot, clamped to [0, 30 min]; the last one gets 30 min. Snapshots that
 * share a timestamp (legacy retry duplicates) get ~0 weight, and a gap in
 * coverage never lets one reading dominate.
 */
export function intervalWeights(snapshots: SnapshotLike[]): number[] {
  return snapshots.map((current, index) => {
    const next = snapshots[index + 1];
    return next
      ? Math.max(
          0,
          Math.min(
            HALF_HOUR_MS,
            next.snapshotAt.getTime() - current.snapshotAt.getTime(),
          ),
        )
      : HALF_HOUR_MS;
  });
}

/** Time-weighted mean (floored); 0 for no snapshots. */
function weightedFloorAverage(values: number[], weights: number[]): number {
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    const weight = weights[index] ?? 0;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? Math.floor(weighted / totalWeight) : 0;
}

function computeViewerHours(
  snapshots: SnapshotLike[],
  weights: number[],
): bigint {
  let viewerHours = 0;
  snapshots.forEach((snapshot, index) => {
    viewerHours +=
      snapshot.totalViewers * ((weights[index] ?? 0) / (60 * 60 * 1000));
  });
  return BigInt(Math.round(viewerHours));
}

export function deriveGameMetrics(
  snapshots: SnapshotLike[],
  now: Date = new Date(),
): GameDerivedMetrics {
  if (snapshots.length === 0) {
    return {
      currentViewers: 0,
      currentChannels: 0,
      peakViewers24h: 0,
      avgViewers7d: 0,
      avgLiveChannels: 0,
      hoursWatched7d: 0n,
    };
  }

  const ordered = [...snapshots].sort(
    (left, right) => left.snapshotAt.getTime() - right.snapshotAt.getTime(),
  );
  const latest = ordered[ordered.length - 1]!;
  const since24h = now.getTime() - DAY_MS;
  const since7d = now.getTime() - WEEK_MS;

  const last24h = ordered.filter(
    (snapshot) => snapshot.snapshotAt.getTime() >= since24h,
  );
  const last7d = ordered.filter(
    (snapshot) => snapshot.snapshotAt.getTime() >= since7d,
  );
  // Averages are time-weighted like viewer hours: an unweighted mean let
  // duplicate retry snapshots skew avgViewers7d above peakViewers24h.
  const weights7d = intervalWeights(last7d);

  return {
    currentViewers: latest.totalViewers,
    currentChannels: latest.totalChannels,
    peakViewers24h: last24h.reduce(
      (peak, snapshot) => Math.max(peak, snapshot.totalViewers),
      0,
    ),
    avgViewers7d: weightedFloorAverage(
      last7d.map((snapshot) => snapshot.totalViewers),
      weights7d,
    ),
    avgLiveChannels: weightedFloorAverage(
      last7d.map((snapshot) => snapshot.totalChannels),
      weights7d,
    ),
    hoursWatched7d: computeViewerHours(last7d, weights7d),
  };
}
