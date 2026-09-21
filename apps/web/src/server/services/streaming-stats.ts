import type { Platform } from "@twitchmetrics/database";
import { mergeIntervals, totalMinutes } from "@twitchmetrics/core/rollups";

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
  /** Platform of the snapshot that holds `peak`. */
  peakPlatform: Platform | null;
  avgSamples: number[];
  /** Platforms with at least one peak reading. */
  platforms: Platform[];
  /** Platforms that contributed a positive avg sample. */
  avgPlatforms: Platform[];
};

/** Fold a period's MetricSnapshot rows into peak + avg samples. */
export function extractSnapshotViewerStats(
  snapshots: { platform: Platform; extendedMetrics: unknown }[],
): SnapshotViewerStats {
  let peak: number | null = null;
  let peakPlatform: Platform | null = null;
  const avgSamples: number[] = [];
  const platforms = new Set<Platform>();
  const avgPlatforms = new Set<Platform>();

  for (const snapshot of snapshots) {
    const metrics = viewerMetricsFromExtended(
      snapshot.extendedMetrics as Record<string, unknown> | null,
    );
    if (metrics.peak !== null) {
      if (peak === null || metrics.peak > peak) {
        peak = metrics.peak;
        peakPlatform = snapshot.platform;
      }
      platforms.add(snapshot.platform);
    }
    if (metrics.avg !== null && metrics.avg > 0) {
      avgSamples.push(metrics.avg);
      avgPlatforms.add(snapshot.platform);
    }
  }

  return {
    peak,
    peakPlatform,
    avgSamples,
    platforms: [...platforms],
    avgPlatforms: [...avgPlatforms],
  };
}

export type ShRollupTotals = {
  airtimeSeconds: number;
  minutesWatched: number;
  streamCount: number;
  peak: number | null;
  /** Platform of the rollup row that holds `peak` (null when unknown). */
  peakPlatform: Platform | null;
  /**
   * True when `peak` is C28's cross-platform estimate rather than one
   * platform's reading, so the tile can say so instead of naming a platform.
   */
  peakCombined: boolean;
  /** Platforms with airtime in the period. */
  airtimePlatforms: Platform[];
  /** Platforms with watch time in the period (they feed the SH average). */
  watchPlatforms: Platform[];
};

/**
 * Sum a period's ChannelDailyRollup rows into combined SH totals. Rows carry
 * `internalPlatform` (the SH code already mapped) when the caller needs the
 * per-metric platform lists; without it those lists stay empty.
 */
export function aggregateShRollups(
  rollups: {
    airtimeMinutes: number;
    minutesWatched: bigint;
    sessionCount: number;
    peakViewers: number | null;
    internalPlatform?: Platform | null;
  }[],
): ShRollupTotals {
  let airtimeSeconds = 0;
  let minutesWatched = 0;
  let streamCount = 0;
  let peak: number | null = null;
  let peakPlatform: Platform | null = null;
  const airtimePlatforms = new Set<Platform>();
  const watchPlatforms = new Set<Platform>();

  for (const row of rollups) {
    airtimeSeconds += row.airtimeMinutes * 60;
    minutesWatched += Number(row.minutesWatched);
    streamCount += row.sessionCount;
    if (row.peakViewers !== null && (peak === null || row.peakViewers > peak)) {
      peak = row.peakViewers;
      peakPlatform = row.internalPlatform ?? null;
    }
    if (row.internalPlatform) {
      if (row.airtimeMinutes > 0) airtimePlatforms.add(row.internalPlatform);
      if (row.minutesWatched > 0n) watchPlatforms.add(row.internalPlatform);
    }
  }

  return {
    airtimeSeconds,
    minutesWatched,
    streamCount,
    peak,
    peakPlatform,
    // Per-channel rows are always a single platform's reading.
    peakCombined: false,
    airtimePlatforms: [...airtimePlatforms],
    watchPlatforms: [...watchPlatforms],
  };
}

/** One CreatorDailyRollup row, as both read paths select it. */
export type CreatorRollupDay = {
  date: Date;
  uniqueAirtimeMinutes: number;
  minutesWatched: bigint;
  streamBlocks: number;
  platforms: Platform[];
  /** Merged [startMinute, endMinute] pairs from 00:00Z; Json, so unknown. */
  intervals: unknown;
  peakViewers: number | null;
  peakPlatform: Platform | null;
};

/** A Twitch VOD, as the Videos API returns it. */
export type VodAirtime = { startedAt: Date; durationSeconds: number };

const MINUTE_MS = 60_000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIntervals(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null;
  const parsed: [number, number][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [start, end] = entry;
    if (typeof start !== "number" || typeof end !== "number") continue;
    parsed.push([start, end]);
  }
  return parsed;
}

/**
 * Split VODs into per-UTC-day minute intervals. A stream crossing midnight
 * yields one interval per day it touches, in the same shape (minutes from
 * 00:00Z) that `CreatorDailyRollup.intervals` stores, so the two can merge.
 */
export function vodIntervalsByDay(
  vods: VodAirtime[],
): Map<string, [number, number][]> {
  const byDay = new Map<string, [number, number][]>();
  for (const vod of vods) {
    if (vod.durationSeconds <= 0) continue;
    const startMs = vod.startedAt.getTime();
    const endMs = startMs + vod.durationSeconds * 1000;

    let cursor = new Date(vod.startedAt);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor.getTime() < endMs) {
      const dayStartMs = cursor.getTime();
      const start = Math.max(startMs, dayStartMs);
      const end = Math.min(endMs, dayStartMs + DAY_MS);
      if (end > start) {
        const key = dayKey(cursor);
        const list = byDay.get(key) ?? [];
        list.push([
          (start - dayStartMs) / MINUTE_MS,
          (end - dayStartMs) / MINUTE_MS,
        ]);
        byDay.set(key, list);
      }
      cursor = new Date(dayStartMs + DAY_MS);
    }
  }
  return byDay;
}

/**
 * Fold CreatorDailyRollup rows into the same shape `combineViewerStats` takes,
 * so the viewer math is identical whichever table fed it.
 *
 * Airtime is the creator's MERGED wall-clock time: a simulcast counts once, so
 * `Σ minutesWatched / airtime` is the combined concurrent average rather than
 * a halved one (the QA sheet's "should be unique airtime" and "doing the
 * average instead of both platforms combined").
 *
 * Twitch VOD time is UNIONED, never added. SH's Twitch feed misses ~8 % of
 * live channels, so VODs still have to fill those gaps — but on a day SH
 * already covers Twitch, adding VOD duration would double-count the very
 * stream the rollup describes. Days SH covers for Twitch are therefore left
 * alone, and on other days the VOD intervals merge with the stored ones, so
 * time that overlaps a YouTube or Kick block is not counted twice either.
 */
export function aggregateCreatorRollups(
  rows: CreatorRollupDay[],
  vods: VodAirtime[] = [],
): ShRollupTotals & { streamBlocks: number; vodMinutesAdded: number } {
  const vodsByDay = vodIntervalsByDay(vods);

  let airtimeMinutes = 0;
  let minutesWatched = 0;
  let streamBlocks = 0;
  let vodMinutesAdded = 0;
  let peak: number | null = null;
  let peakPlatform: Platform | null = null;
  let peakCombined = false;
  const airtimePlatforms = new Set<Platform>();
  const watchPlatforms = new Set<Platform>();

  for (const row of rows) {
    const key = dayKey(row.date);
    const dayVods = vodsByDay.get(key);
    vodsByDay.delete(key);

    const stored = parseIntervals(row.intervals);
    const coversTwitch = row.platforms.includes("twitch");
    // Rows written before `intervals` existed, or by a path that left it null,
    // can't be merged against — keep their own figure and skip the union.
    const canMerge = stored !== null && stored.length > 0;

    if (dayVods && !coversTwitch && canMerge) {
      const merged = mergeIntervals([...stored, ...dayVods]);
      const mergedMinutes = Math.round(totalMinutes(merged));
      vodMinutesAdded += Math.max(0, mergedMinutes - row.uniqueAirtimeMinutes);
      airtimeMinutes += mergedMinutes;
      streamBlocks += merged.length;
      airtimePlatforms.add("twitch");
    } else {
      airtimeMinutes += row.uniqueAirtimeMinutes;
      streamBlocks += row.streamBlocks;
    }

    minutesWatched += Number(row.minutesWatched);
    if (row.peakViewers !== null && (peak === null || row.peakViewers > peak)) {
      peak = row.peakViewers;
      peakPlatform = row.peakPlatform;
      // buildCreatorRollups leaves peakPlatform null exactly when the figure
      // came from more than one platform (C28).
      peakCombined = row.peakPlatform === null && row.platforms.length > 1;
    }
    for (const platform of row.platforms) {
      if (row.uniqueAirtimeMinutes > 0) airtimePlatforms.add(platform);
      if (row.minutesWatched > 0n) watchPlatforms.add(platform);
    }
  }

  // Days with VODs but no rollup row at all: SH never saw the creator that
  // day, so the VOD time is all we have.
  for (const dayVods of vodsByDay.values()) {
    const merged = mergeIntervals(dayVods);
    const mergedMinutes = Math.round(totalMinutes(merged));
    if (mergedMinutes <= 0) continue;
    airtimeMinutes += mergedMinutes;
    vodMinutesAdded += mergedMinutes;
    streamBlocks += merged.length;
    airtimePlatforms.add("twitch");
  }

  return {
    airtimeSeconds: airtimeMinutes * 60,
    minutesWatched,
    streamCount: streamBlocks,
    streamBlocks,
    vodMinutesAdded,
    peak,
    peakPlatform,
    peakCombined,
    airtimePlatforms: [...airtimePlatforms],
    watchPlatforms: [...watchPlatforms],
  };
}

/**
 * Combine snapshot-derived and SH-derived viewer stats into the displayed
 * peak/avg pair. Peak is the best single platform-day reading across both
 * sources (not a combined simulcast peak); `peakPlatform` names where it came
 * from, ties going to SH. Average prefers the SH watch-time-weighted figure
 * and falls back to the mean of snapshot samples only when SH has no airtime
 * for the period; `viewerPlatforms` lists the platforms behind whichever
 * average was used.
 */
export function combineViewerStats(
  snapshot: {
    peak: number | null;
    avgSamples: number[];
    peakPlatform?: Platform | null;
    avgPlatforms?: Platform[];
  },
  sh: ShRollupTotals | null,
): {
  peakViewers: number | null;
  avgViewers: number | null;
  peakPlatform: Platform | null;
  peakCombined: boolean;
  viewerPlatforms: Platform[];
} {
  const shPeak = sh?.peak ?? null;
  const snapshotWins =
    snapshot.peak !== null && (shPeak === null || snapshot.peak > shPeak);
  const peakViewers = snapshotWins ? snapshot.peak : shPeak;
  const peakPlatform =
    peakViewers === null
      ? null
      : snapshotWins
        ? (snapshot.peakPlatform ?? null)
        : (sh?.peakPlatform ?? null);
  // Only the SH side can produce a combined estimate; a snapshot reading is
  // always one platform.
  const peakCombined =
    peakViewers !== null && !snapshotWins && (sh?.peakCombined ?? false);

  let avgViewers: number | null = null;
  let viewerPlatforms: Platform[] = [];
  if (sh && sh.airtimeSeconds > 0) {
    avgViewers = Math.round(sh.minutesWatched / (sh.airtimeSeconds / 60));
    viewerPlatforms = sh.watchPlatforms;
  } else if (snapshot.avgSamples.length > 0) {
    avgViewers = Math.round(
      snapshot.avgSamples.reduce((a, b) => a + b, 0) /
        snapshot.avgSamples.length,
    );
    viewerPlatforms = snapshot.avgPlatforms ?? [];
  }

  return {
    peakViewers,
    avgViewers,
    peakPlatform,
    peakCombined,
    viewerPlatforms,
  };
}
