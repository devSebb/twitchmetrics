/**
 * What each number on the site means and where it comes from — the text in
 * the "?" cards (components/shared/InfoTip). One place, so the explanation of
 * a metric reads the same on every page that shows it.
 *
 * Keep each entry true to the code that computes the number: when the
 * calculation changes, this text changes with it.
 */

export type MetricInfo = {
  /** The metric's name, as the card's heading. */
  title: string;
  /** What the number is, in one or two plain sentences. */
  body: string;
  /** Where the data comes from. */
  source: string;
  /** The exact period covered, when the caller knows it. */
  window?: string;
};

const SH_DAILY = "Stream Hatchet daily stream data";

export const CREATOR_STATS_INFO = {
  period: {
    title: "Stats period",
    body: "Each period is that many whole days (UTC), ending on the newest day with complete data. Today isn't included yet: a day's data arrives the following morning.",
    source: `${SH_DAILY}, plus our own platform readings`,
  },
  airtime: {
    title: "Airtime",
    body: "Total time live in the period. Simulcasts count once: overlapping streams on different platforms are merged into real time.",
    source: `${SH_DAILY}. Twitch VODs fill days Stream Hatchet missed.`,
  },
  avgAirtime: {
    title: "Avg Airtime",
    body: "Airtime divided by the number of streams in the period. A stream is one continuous live block, across platforms.",
    source: `${SH_DAILY}. Twitch VODs fill days Stream Hatchet missed.`,
  },
  peakViewers: {
    title: "Peak Viewers",
    body: "The highest audience on a single platform in the period.",
    source: `${SH_DAILY} (daily peak per channel), or our own Twitch / YouTube readings when they saw a higher one.`,
  },
  peakViewersCombined: {
    title: "Peak Viewers · estimated combined",
    body: "Highest platform peak in the period plus what the creator's other platforms averaged at that moment. An estimate: the data has one peak per channel per day, not a minute-by-minute series.",
    source: SH_DAILY,
  },
  avgViewers: {
    title: "Avg Viewers",
    body: "Average concurrent viewers while live: total minutes watched divided by airtime, across all platforms.",
    source: `${SH_DAILY}. Creators Stream Hatchet doesn't cover use the average of our own periodic platform readings.`,
  },
  newFollowers: {
    title: "New Followers",
    body: "Change in followers between the first and last reading in the period, added up across platforms.",
    source:
      "Platform APIs (Twitch, YouTube) and Stream Hatchet follower counts",
  },
} satisfies Record<string, MetricInfo>;

/** An entry with the exact period it covers, e.g. "Sep 20 – Oct 19, 2026". */
export function withWindow(info: MetricInfo, window: string): MetricInfo {
  return { ...info, window };
}
