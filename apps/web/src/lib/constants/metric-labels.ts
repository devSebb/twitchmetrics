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
