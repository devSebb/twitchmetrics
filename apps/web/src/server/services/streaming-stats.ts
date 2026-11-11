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

export type StatsWindow = {
  /** UTC midnight of the first day. */
  start: Date;
  /** UTC midnight after the last day (exclusive). */
  end: Date;
  /** UTC midnight of the last day — the day the range label ends on. */
  lastDay: Date;
};

/**
 * The N whole UTC days ending on `lastDay`, inclusive.
 *
 * Creator stats used to run from midnight N days back to NOW: N+1 calendar
 * days, the newest one or two of them still empty because a day's Stream
 * Hatchet data only lands the next day. Totals read short of SH's and the
 * window had no stated dates (QA 2026-10, Anyme023 / Caedrel avg airtime).
 * Ending on the newest complete day makes "30d" mean 30 measured days.
 */
export function completeDayWindow(days: number, lastDay: Date): StatsWindow {
  const last = new Date(lastDay);
  last.setUTCHours(0, 0, 0, 0);
  const end = new Date(last.getTime() + DAY_MS);
  return { start: new Date(end.getTime() - days * DAY_MS), end, lastDay: last };
}

/**
 * VODs cut to the window: one starting before `end` but running past it keeps
 * only its in-window part, so the day after the window gains no airtime.
 */
export function clipVodsToWindow(
  vods: VodAirtime[],
  window: Pick<StatsWindow, "start" | "end">,
): VodAirtime[] {
  const clipped: VodAirtime[] = [];
  for (const vod of vods) {
    const begins = Math.max(vod.startedAt.getTime(), window.start.getTime());
    const ends = Math.min(
      vod.startedAt.getTime() + vod.durationSeconds * 1000,
      window.end.getTime(),
    );
    if (ends <= begins) continue;
    clipped.push({
      startedAt: new Date(begins),
      durationSeconds: Math.round((ends - begins) / 1000),
    });
  }
  return clipped;
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
    airtimePlatforms: [...airtimePlatforms],
    watchPlatforms: [...watchPlatforms],
  };
}

/**
 * Combine snapshot-derived and SH-derived viewer stats into the displayed
 * peak/avg pair. Both come from Stream Hatchet whenever it has them, and from
 * our own snapshots only for creators it doesn't cover: the two sources are
 * never mixed (QA 2026-11, Stream Hatchet: every number SH has should be
 * SH's). Before this, a snapshot peak above SH's replaced it, so the tile
 * could show a figure SH's own pages never would. `peakPlatform` names where
 * the peak came from; `viewerPlatforms` lists the platforms behind the
 * average.
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
  viewerPlatforms: Platform[];
} {
  const shPeak = sh?.peak ?? null;
  const snapshotWins = snapshot.peak !== null && shPeak === null;
  const peakViewers = snapshotWins ? snapshot.peak : shPeak;
  const peakPlatform =
    peakViewers === null
      ? null
      : snapshotWins
        ? (snapshot.peakPlatform ?? null)
        : (sh?.peakPlatform ?? null);

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
    viewerPlatforms,
  };
}

// ============================================================
// FOLLOWER GAIN
// ============================================================

/**
 * Longest gap allowed between a follower reading and the window edge it
 * stands for. Shared with the data pipeline's follower-verification rule
 * (PLAN-infra R4): weekly re-checks plus late GitHub starts fit inside it.
 */
export const FOLLOWER_VERIFY_TOLERANCE_DAYS = 10;

/** Share of the window a reading may sit away from its edge (7D → 1.75 days). */
const FOLLOWER_EDGE_SHARE = 0.25;

/** Shortest tracked span a "since <date>" partial gain may cover. */
export const FOLLOWER_PARTIAL_MIN_DAYS = 30;

export type FollowerReading = {
  platform: Platform;
  snapshotAt: Date;
  followerCount: bigint | null;
};

export type FollowerGain = {
  /** Summed over measurable platforms; null when none is measurable. */
  gain: number | null;
  /** The platforms the gain covers. */
  platforms: Platform[];
  /**
   * Set when the gain covers only part of the window: tracking started
   * after the window did, so it runs from this reading to the window end.
   */
  since: Date | null;
};

/**
 * Follower change over a window, only where both ends are actually measured.
 *
 * Per platform: the start is the latest reading at or before the window
 * start, the end the latest reading before the window end. Each must sit
 * within min(10 days, 25 % of the window) of its edge, and the end must fall
 * inside the window. Anything looser invents a number: Stream Hatchet writes
 * a snapshot only when the count changes, so a months-old baseline against a
 * fresh change would credit months of growth to one window, and "no reading"
 * is not "no change". Null-count readings (Kick polls) are skipped.
 *
 * With `partial` (6M / 1Y, where most tracking is younger than the window):
 * when no platform covers the whole window, the gain may instead run from a
 * later common start `since`, at least 30 days before the end, and says so.
 */
export function computeFollowerGain(
  readings: FollowerReading[],
  window: Pick<StatsWindow, "start" | "end">,
  options: { partial?: boolean } = {},
): FollowerGain {
  const windowMs = window.end.getTime() - window.start.getTime();
  const toleranceMs = Math.min(
    FOLLOWER_VERIFY_TOLERANCE_DAYS * DAY_MS,
    windowMs * FOLLOWER_EDGE_SHARE,
  );
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();

  const byPlatform = new Map<
    Platform,
    { start?: FollowerReading; end?: FollowerReading }
  >();
  for (const reading of readings) {
    if (reading.followerCount === null) continue;
    const at = reading.snapshotAt.getTime();
    const edges = byPlatform.get(reading.platform) ?? {};
    if (
      at <= startMs &&
      (!edges.start || at > edges.start.snapshotAt.getTime())
    ) {
      edges.start = reading;
    }
    if (
      at >= startMs &&
      at < endMs &&
      (!edges.end || at > edges.end.snapshotAt.getTime())
    ) {
      edges.end = reading;
    }
    byPlatform.set(reading.platform, edges);
  }

  let gain = 0;
  const platforms: Platform[] = [];
  for (const [platform, { start, end }] of byPlatform) {
    if (!start || !end) continue;
    if (startMs - start.snapshotAt.getTime() > toleranceMs) continue;
    if (endMs - end.snapshotAt.getTime() > toleranceMs) continue;
    gain += Number(end.followerCount! - start.followerCount!);
    platforms.push(platform);
  }
  if (platforms.length > 0 || !options.partial) {
    return { gain: platforms.length > 0 ? gain : null, platforms, since: null };
  }
  return partialFollowerGain(readings, window, toleranceMs);
}

/**
 * The partial gain: platforms whose end is measured share one start, the
 * latest of their first in-window readings, so every platform in the sum
 * covers the same days. A platform without a reading near that start is
 * left out.
 */
function partialFollowerGain(
  readings: FollowerReading[],
  window: Pick<StatsWindow, "start" | "end">,
  toleranceMs: number,
): FollowerGain {
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  const inWindow = readings
    .filter(
      (r) =>
        r.followerCount !== null &&
        r.snapshotAt.getTime() >= startMs &&
        r.snapshotAt.getTime() < endMs,
    )
    .sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime());

  const series = new Map<Platform, FollowerReading[]>();
  for (const r of inWindow) {
    const list = series.get(r.platform) ?? [];
    list.push(r);
    series.set(r.platform, list);
  }
  const candidates = [...series].filter(
    ([, list]) =>
      endMs - list[list.length - 1]!.snapshotAt.getTime() <= toleranceMs,
  );
  if (candidates.length === 0)
    return { gain: null, platforms: [], since: null };

  const sinceMs = Math.max(
    ...candidates.map(([, list]) => list[0]!.snapshotAt.getTime()),
  );
  let gain = 0;
  const platforms: Platform[] = [];
  let latestEndMs = 0;
  for (const [platform, list] of candidates) {
    const start = list.filter((r) => r.snapshotAt.getTime() <= sinceMs).pop();
    if (!start || sinceMs - start.snapshotAt.getTime() > toleranceMs) continue;
    const end = list[list.length - 1]!;
    gain += Number(end.followerCount! - start.followerCount!);
    platforms.push(platform);
    latestEndMs = Math.max(latestEndMs, end.snapshotAt.getTime());
  }
  if (
    platforms.length === 0 ||
    latestEndMs - sinceMs < FOLLOWER_PARTIAL_MIN_DAYS * DAY_MS
  ) {
    return { gain: null, platforms: [], since: null };
  }
  return { gain, platforms, since: new Date(sinceMs) };
}
