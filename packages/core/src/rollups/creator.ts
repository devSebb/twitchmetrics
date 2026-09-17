import type { RollupFact } from "./types";

/**
 * Per-creator daily rollups: wall-clock time, not summed per-platform time.
 *
 * ChannelDailyRollup is per platform channel, so summing it double-counts a
 * simulcast — a 4 h stream on Twitch + YouTube reads as 8 h, and avgViewers
 * (watch time / airtime) comes out halved. QA saw both ("should be unique
 * airtime", "doing the average instead of both platforms combined"). Merging
 * the live intervals fixes the numerator and the denominator at once: the same
 * Σ watch time / unique minutes then yields the combined concurrent average.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type CreatorRollupFact = RollupFact & {
  /** SH platform code of the fact's channel, mapped to our Platform enum. */
  internalPlatform: string | null;
};

export type CreatorRollupRow = {
  creatorProfileId: string;
  date: Date;
  uniqueAirtimeMinutes: number;
  minutesWatched: bigint;
  streamBlocks: number;
  platforms: string[];
  /** Merged live blocks as [startMinute, endMinute] from 00:00Z. */
  intervals: [number, number][];
  peakViewers: number | null;
  peakPlatform: string | null;
};

/**
 * Merge [start, end] minute ranges, joining ones that touch or overlap.
 * Exported for the read path, which unions Twitch VOD intervals into a day
 * whose SH rollups do not cover Twitch.
 */
export function mergeIntervals(
  intervals: [number, number][],
): [number, number][] {
  const sorted = [...intervals]
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function totalMinutes(intervals: [number, number][]): number {
  return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
}

/** A fact's live interval clipped to the day, in minutes from 00:00Z. */
function clipToDay(
  fact: Pick<RollupFact, "streamBeginsAt" | "streamEndsAt">,
  dayStart: Date,
): [number, number] | null {
  const dayStartMs = dayStart.getTime();
  const start = Math.max(fact.streamBeginsAt.getTime(), dayStartMs);
  const end = Math.min(fact.streamEndsAt.getTime(), dayStartMs + DAY_MS);
  if (end <= start) return null;
  return [(start - dayStartMs) / 60_000, (end - dayStartMs) / 60_000];
}

/**
 * Build one row per creator for a day. `facts` must be every platform's facts
 * overlapping that day (a creator's day spans platforms, so this runs once per
 * date, after the per-platform rollups). Facts with no creatorProfileId are
 * skipped: unmatched channels have no creator to roll up to.
 *
 * `minutesWatched` sums each platform's attributed watch time — a simulcast's
 * audiences add up, even though its airtime does not.
 */
export function buildCreatorRollups(
  facts: CreatorRollupFact[],
  date: Date,
): CreatorRollupRow[] {
  const byCreator = new Map<string, CreatorRollupFact[]>();
  for (const fact of facts) {
    if (!fact.creatorProfileId) continue;
    const existing = byCreator.get(fact.creatorProfileId);
    if (existing) existing.push(fact);
    else byCreator.set(fact.creatorProfileId, [fact]);
  }

  const rows: CreatorRollupRow[] = [];
  for (const [creatorProfileId, creatorFacts] of byCreator.entries()) {
    const clipped: [number, number][] = [];
    const platforms = new Set<string>();
    let minutesWatched = 0n;
    let peakViewers: number | null = null;
    let peakPlatform: string | null = null;

    for (const fact of creatorFacts) {
      const interval = clipToDay(fact, date);
      if (!interval) continue;
      clipped.push(interval);
      if (fact.internalPlatform) platforms.add(fact.internalPlatform);

      // The day's share of this fact's watch time, same fraction the channel
      // rollups use.
      const spanMs = Math.max(
        0,
        fact.streamEndsAt.getTime() - fact.streamBeginsAt.getTime(),
      );
      const overlapMinutes = interval[1] - interval[0];
      const fraction = spanMs > 0 ? (overlapMinutes * 60_000) / spanMs : 1;
      minutesWatched += BigInt(
        Math.round(Number(fact.minutesWatched) * Math.min(1, fraction)),
      );

      if (peakViewers === null || fact.peakViewers > peakViewers) {
        peakViewers = fact.peakViewers;
        peakPlatform = fact.internalPlatform;
      }
    }

    if (clipped.length === 0) continue;
    const intervals = mergeIntervals(clipped);

    rows.push({
      creatorProfileId,
      date,
      uniqueAirtimeMinutes: Math.round(totalMinutes(intervals)),
      minutesWatched,
      // Merged blocks: a simulcast is one block, not one per platform.
      streamBlocks: intervals.length,
      platforms: [...platforms].sort(),
      intervals: intervals.map(
        ([start, end]) =>
          [Math.round(start), Math.round(end)] as [number, number],
      ),
      peakViewers,
      peakPlatform,
    });
  }

  return rows;
}
