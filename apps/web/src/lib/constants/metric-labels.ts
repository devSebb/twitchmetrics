import type { MetricKey } from "@/lib/constants/report-templates";

/**
 * Canonical display names for report metrics. Every surface that names a
 * metric — report-type cards, the configurator, CSV output, and sales
 * emails — must render from this map so the same metric never appears
 * under two different names (QA REP-01).
 */
export const REPORT_METRIC_LABELS: Record<MetricKey, string> = {
  hoursWatched: "Hours Watched",
  avgViewers: "Avg Viewers",
  peakViewers: "Peak Viewers",
  topCreators: "Top Channels",
  airtime: "Airtime",
  subscribers: "Subscribers",
  gender: "Gender",
  country: "Primary Country",
  topCategories: "Top Categories",
} as const;

/**
 * The `topCreators` metric is contextual: a games report ranks the top
 * channels within a game, a channels report ranks the top creators in the
 * selection. Both spellings live here so no surface invents its own.
 */
export function topEntitiesLabel(include: "games" | "channels"): string {
  return include === "games"
    ? REPORT_METRIC_LABELS.topCreators
    : "Top Creators";
}

/**
 * Game page KPI tiles. The time window is part of every label (QA: "What are
 * the periods of the metrics?"). The 7d/24h figures come only from
 * GameViewerSnapshot, which only the Twitch game-snapshot job writes, so they
 * say "Twitch"; the live tiles show a per-platform breakdown instead.
 */
export const GAME_KPI_LABELS = {
  avgViewers7d: "Avg Viewers · Twitch 7d",
  peakViewers24h: "Peak Viewers · Twitch 24h",
  liveViewers: "Live Viewers",
  liveChannels: "Live Channels",
  avgLiveChannels: "Avg Live Channels · Twitch 7d",
} as const;

/** Creator stats row periods, in selector order. */
export const CREATOR_STAT_PERIODS = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
] as const;

export type CreatorStatPeriod = (typeof CREATOR_STAT_PERIODS)[number]["value"];

export type CreatorStatMetric =
  | "airtime"
  | "avgAirtime"
  | "peakViewers"
  | "avgViewers"
  | "newFollowers";

const CREATOR_STAT_NAMES: Record<CreatorStatMetric, string> = {
  airtime: "Airtime",
  avgAirtime: "Avg Airtime",
  // Until a combined simulcast peak exists this is the best single platform.
  peakViewers: "Best-Platform Peak",
  avgViewers: "Avg Viewers",
  newFollowers: "New Followers",
};

/** Explains the peak tile, which is not a combined cross-platform peak. */
export const CREATOR_PEAK_VIEWERS_TOOLTIP =
  "Highest single-platform peak in the period.";

/**
 * Shown instead when the figure combines platforms (C28). The export carries
 * one peak per channel per day and no viewer series, so a simulcast's combined
 * peak is estimated: the best platform's peak plus what the others averaged
 * while live at that minute.
 */
export const CREATOR_COMBINED_PEAK_TOOLTIP =
  "Estimated combined peak: the highest platform peak in the period, plus what the creator's other platforms averaged at that moment.";

/** Suffix marking a peak figure that spans platforms rather than naming one. */
export const COMBINED_PEAK_SUFFIX = "estimated combined";

/** Creator stat tile label with its window, e.g. "Airtime · 30d". */
export function creatorStatLabel(
  metric: CreatorStatMetric,
  period: CreatorStatPeriod,
): string {
  return `${CREATOR_STAT_NAMES[metric]} · ${period}`;
}
