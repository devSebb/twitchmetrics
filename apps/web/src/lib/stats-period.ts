import type { CreatorStatPeriod } from "@/lib/constants/metric-labels";

/** Whole days each Stats Row period covers. */
export const CREATOR_STAT_PERIOD_DAYS: Record<CreatorStatPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

/** The period the Stats Row opens on when nothing better applies. */
export const DEFAULT_STAT_PERIOD: CreatorStatPeriod = "30d";

/**
 * Periods the Stats Row may open on, shortest first. 7D is never picked
 * automatically: a creator who streams weekly would flip between views.
 */
const AUTO_PERIODS: CreatorStatPeriod[] = ["30d", "3m", "6m", "1y"];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Server-decided Stats Row defaults, serialized for the client.
 * `lastStreamDay` is the UTC day (ISO) of the newest stream we have rollups
 * for, or null when none.
 */
export type StatsContext = {
  initialPeriod: CreatorStatPeriod;
  lastStreamDay: string | null;
};

/**
 * The shortest period whose window (N whole UTC days ending on
 * `lastCompleteDay`) contains the creator's last stream, so a creator who
 * last streamed in August doesn't open on an empty 30D. Never streamed, or
 * older than a year: 30D, where the Stats Row says there are no streams.
 */
export function pickStatsPeriod(
  lastStreamDay: Date | null,
  lastCompleteDay: Date,
): CreatorStatPeriod {
  if (!lastStreamDay) return DEFAULT_STAT_PERIOD;
  const last = new Date(lastCompleteDay);
  last.setUTCHours(0, 0, 0, 0);
  const end = last.getTime() + DAY_MS;
  for (const period of AUTO_PERIODS) {
    const start = end - CREATOR_STAT_PERIOD_DAYS[period] * DAY_MS;
    if (lastStreamDay.getTime() >= start) return period;
  }
  return DEFAULT_STAT_PERIOD;
}
