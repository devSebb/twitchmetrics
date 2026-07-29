import type { Platform } from "@twitchmetrics/database";

/**
 * Pure aggregation math shared by the profile stats (trpc snapshot router)
 * and the /creators list batch stats. Two rules enforced here:
 *
 * 1. Windows over `@db.Date` rollup columns must start at UTC midnight —
 *    a timestamp with a time-of-day component silently excludes the earliest
 *    rollup day (stored as midnight) from every `gte` comparison.
 * 2. Never mix per-poll snapshot averages with Stream Hatchet aggregates in
 *    one mean. SH totals are watch-time-weighted (Σ minutesWatched /
 *    Σ airtimeMinutes) over complete daily coverage; per-poll AVG_VIEWERS
 *    samples carry no weight. When SH covers the period it wins; snapshot
 *    samples are the fallback, not a co-equal vote.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC-midnight start of an N-day window ending now. */
export function rollupWindowStart(days: number, now: Date = new Date()): Date {
  const start = new Date(now.getTime() - days * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export type ViewerMetrics = {
  peak: number | null;
  avg: number | null;
};

/** Peak/avg viewer readings from one MetricSnapshot's extendedMetrics JSON. */
export function viewerMetricsFromExtended(
  ext: Record<string, unknown> | null,
): ViewerMetrics {
  if (!ext) return { peak: null, avg: null };

  const peak =
    typeof ext.PEAK_VIEWERS === "number"
      ? ext.PEAK_VIEWERS
      : typeof ext.LIVE_VIEWER_COUNT === "number"
        ? ext.LIVE_VIEWER_COUNT
        : null;

  const avg =
    typeof ext.AVG_VIEWERS === "number"
      ? ext.AVG_VIEWERS
      : typeof ext.LIVE_VIEWER_COUNT === "number"
        ? ext.LIVE_VIEWER_COUNT
        : null;

  return { peak, avg };
}

export type SnapshotViewerStats = {
  peak: number | null;
  avgSamples: number[];
  platforms: Platform[];
};

/** Fold a period's MetricSnapshot rows into peak + avg samples. */
export function extractSnapshotViewerStats(
  snapshots: { platform: Platform; extendedMetrics: unknown }[],
): SnapshotViewerStats {
  let peak: number | null = null;
  const avgSamples: number[] = [];
  const platforms = new Set<Platform>();

  for (const snapshot of snapshots) {
    const metrics = viewerMetricsFromExtended(
      snapshot.extendedMetrics as Record<string, unknown> | null,
    );
    if (metrics.peak !== null) {
      if (peak === null || metrics.peak > peak) peak = metrics.peak;
      platforms.add(snapshot.platform);
    }
    if (metrics.avg !== null && metrics.avg > 0) {
      avgSamples.push(metrics.avg);
    }
  }

  return { peak, avgSamples, platforms: [...platforms] };
}

export type ShRollupTotals = {
  airtimeSeconds: number;
  minutesWatched: number;
  streamCount: number;
  peak: number | null;
};

/** Sum a period's ChannelDailyRollup rows into combined SH totals. */
export function aggregateShRollups(
  rollups: {
    airtimeMinutes: number;
    minutesWatched: bigint;
    sessionCount: number;
    peakViewers: number | null;
  }[],
): ShRollupTotals {
  let airtimeSeconds = 0;
  let minutesWatched = 0;
  let streamCount = 0;
  let peak: number | null = null;

  for (const row of rollups) {
    airtimeSeconds += row.airtimeMinutes * 60;
    minutesWatched += Number(row.minutesWatched);
    streamCount += row.sessionCount;
    if (row.peakViewers !== null && (peak === null || row.peakViewers > peak)) {
      peak = row.peakViewers;
    }
  }

  return { airtimeSeconds, minutesWatched, streamCount, peak };
}

/**
 * Combine snapshot-derived and SH-derived viewer stats into the displayed
 * peak/avg pair. Peak is a true max across both sources. Average prefers the
 * SH watch-time-weighted figure and falls back to the mean of snapshot
 * samples only when SH has no airtime for the period.
 */
export function combineViewerStats(
  snapshot: { peak: number | null; avgSamples: number[] },
  sh: ShRollupTotals | null,
): { peakViewers: number | null; avgViewers: number | null } {
  const peakViewers =
    snapshot.peak === null
      ? (sh?.peak ?? null)
      : sh?.peak == null
        ? snapshot.peak
        : Math.max(snapshot.peak, sh.peak);

  let avgViewers: number | null = null;
  if (sh && sh.airtimeSeconds > 0) {
    avgViewers = Math.round(sh.minutesWatched / (sh.airtimeSeconds / 60));
  } else if (snapshot.avgSamples.length > 0) {
    avgViewers = Math.round(
      snapshot.avgSamples.reduce((a, b) => a + b, 0) /
        snapshot.avgSamples.length,
    );
  }

  return { peakViewers, avgViewers };
}
