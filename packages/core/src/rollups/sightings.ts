import type { RollupFact } from "./types";

/**
 * Per-day viewers for streams that run longer than one export window.
 *
 * Every daily export describes a stream over a sliding 3-day window, and the
 * import merges those sightings into ONE fact (./facts). The merged fact keeps
 * a single peak (the highest ever seen) and a single average (over its whole
 * life). Spread over the days it covers, that put the all-time peak on every
 * day and the lifetime average on every day: Quiet Little Sanctuary's 30-day
 * peak read 6,072, set on Oct 5 by a stream still live in late November, where
 * Stream Hatchet BI shows 1,142 for the same 30 days (QA 2026-11-24).
 *
 * `sightingsByDay` keeps what each export said, keyed by the export day:
 *
 *   { "2026-11-23": [averageViewers, peakViewers, peakAtEpochSeconds | null] }
 *
 * The export for day N covers N-2 00:00 to N 23:59 UTC.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A single sighting is capped at the window (4,319 min). Anything longer is a
 * merge of several, so its fact-level peak and average describe more than the
 * day being rolled up.
 */
export const SIGHTING_WINDOW_MINUTES = 4330;

/** Days an export reaches back from its own day. */
const WINDOW_REACH_DAYS = 2;

export type Sighting = {
  /** 00:00Z of the export day. */
  exportDay: Date;
  averageViewers: number;
  peakViewers: number;
  peakViewersAt: Date | null;
};

export type DayViewers = {
  averageViewers: number;
  peakViewers: number;
  peakViewersAt: Date | null;
};

/** One entry of the stored JSON, as written by the import. */
export function sightingEntry(input: {
  averageViewers: number;
  peakViewers: number;
  peakViewersAt: Date | null;
}): [number, number, number | null] {
  return [
    input.averageViewers,
    input.peakViewers,
    input.peakViewersAt
      ? Math.round(input.peakViewersAt.getTime() / 1000)
      : null,
  ];
}

export function parseSightings(raw: unknown): Sighting[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const sightings: Sighting[] = [];
  for (const [day, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const exportDay = new Date(`${day}T00:00:00.000Z`);
    const averageViewers = Number(value[0]);
    const peakViewers = Number(value[1]);
    if (
      Number.isNaN(exportDay.getTime()) ||
      !Number.isFinite(averageViewers) ||
      !Number.isFinite(peakViewers)
    ) {
      continue;
    }
    const peakAt = value[2];
    sightings.push({
      exportDay,
      averageViewers,
      peakViewers,
      peakViewersAt:
        typeof peakAt === "number" && Number.isFinite(peakAt)
          ? new Date(peakAt * 1000)
          : null,
    });
  }
  return sightings.sort(
    (a, b) => a.exportDay.getTime() - b.exportDay.getTime(),
  );
}

export function isLongRunning(
  fact: Pick<RollupFact, "streamBeginsAt" | "streamEndsAt">,
): boolean {
  const spanMinutes =
    (fact.streamEndsAt.getTime() - fact.streamBeginsAt.getTime()) / 60_000;
  return spanMinutes > SIGHTING_WINDOW_MINUTES;
}

function onDay(instant: Date | null, dayStart: Date): boolean {
  if (!instant) return false;
  const offset = instant.getTime() - dayStart.getTime();
  return offset >= 0 && offset < DAY_MS;
}

/**
 * What a long-running stream's viewers were on one UTC day, or null when the
 * fact is an ordinary stream and its own figures apply.
 *
 * Average: the mean of the exports whose window covers the day (the day's own
 * export and the next two). With none, the fact's lifetime average, as before.
 *
 * Peak: a peak counts on the day its timestamp falls on. An export's peak is
 * the highest moment of its 3 days, so a day no export points at was not the
 * high point of any window around it; it gets its average instead, which can
 * never carry another day's peak into a 30-day window.
 */
export function longRunningDayViewers(
  fact: Pick<
    RollupFact,
    | "streamBeginsAt"
    | "streamEndsAt"
    | "averageViewers"
    | "peakViewers"
    | "peakViewersAt"
    | "sightingsByDay"
  >,
  dayStart: Date,
): DayViewers | null {
  if (!isLongRunning(fact)) return null;

  const sightings = parseSightings(fact.sightingsByDay);
  const dayMs = dayStart.getTime();
  const covering = sightings.filter((s) => {
    const ahead = (s.exportDay.getTime() - dayMs) / DAY_MS;
    return ahead >= 0 && ahead <= WINDOW_REACH_DAYS;
  });

  const averageViewers =
    covering.length > 0
      ? covering.reduce((sum, s) => sum + s.averageViewers, 0) / covering.length
      : fact.averageViewers;

  let peak: { viewers: number; at: Date | null } | null = null;
  const consider = (viewers: number, at: Date | null) => {
    if (!onDay(at, dayStart)) return;
    if (!peak || viewers > peak.viewers) peak = { viewers, at };
  };
  consider(fact.peakViewers, fact.peakViewersAt);
  for (const s of sightings) consider(s.peakViewers, s.peakViewersAt);

  const found = peak as { viewers: number; at: Date | null } | null;
  return {
    averageViewers,
    peakViewers: found ? found.viewers : Math.round(averageViewers),
    peakViewersAt: found ? found.at : null,
  };
}
