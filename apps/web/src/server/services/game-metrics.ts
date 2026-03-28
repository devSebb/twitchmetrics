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

function floorAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.floor(total / values.length);
}

function computeViewerHours(snapshots: SnapshotLike[]): bigint {
  if (snapshots.length === 0) return 0n;

  let viewerHours = 0;

  for (let index = 0; index < snapshots.length; index++) {
    const current = snapshots[index]!;
    const next = snapshots[index + 1];
    const intervalMs = next
      ? Math.max(
          0,
          Math.min(
            HALF_HOUR_MS,
            next.snapshotAt.getTime() - current.snapshotAt.getTime(),
          ),
        )
      : HALF_HOUR_MS;

    viewerHours += current.totalViewers * (intervalMs / (60 * 60 * 1000));
  }

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

  return {
    currentViewers: latest.totalViewers,
    currentChannels: latest.totalChannels,
    peakViewers24h: last24h.reduce(
      (peak, snapshot) => Math.max(peak, snapshot.totalViewers),
      0,
    ),
    avgViewers7d: floorAverage(last7d.map((snapshot) => snapshot.totalViewers)),
    avgLiveChannels: floorAverage(
      last7d.map((snapshot) => snapshot.totalChannels),
    ),
    hoursWatched7d: computeViewerHours(last7d),
  };
}
