/**
 * The published rankings (/rankings): which exist, their URLs and their copy.
 *
 * One place for pages, navigation, the sitemap and the legacy redirects, so a
 * ranking cannot be linked before it exists. The numbers come from
 * RankingEntry, written by workers/build-rankings.ts: the rules stated in the
 * methodology copy here must match that worker.
 */
import type { Platform } from "@twitchmetrics/database";

export const RANKING_WINDOW_DAYS = 30;
/** Rows on a ranking page. All are in the HTML; the first few are open. */
export const RANKING_PAGE_DEPTH = 50;
export const RANKING_OPEN_ROWS = 20;
/** Hours on air needed to enter an average-viewers ranking. */
export const RANKING_AVG_MIN_HOURS = 10;

export const RANKING_SCOPES = [
  "all-platforms",
  "twitch",
  "youtube",
  "kick",
  "instagram",
  "tiktok",
  "x",
] as const;
export type RankingScope = (typeof RANKING_SCOPES)[number];

export const CREATOR_METRICS = [
  "most-watched",
  "average-viewers",
  "peak-viewers",
  "fastest-growing",
  "most-followed",
] as const;
export type CreatorMetric = (typeof CREATOR_METRICS)[number];

export const CATEGORY_METRICS = ["most-watched", "most-streamed"] as const;
export type CategoryMetric = (typeof CATEGORY_METRICS)[number];

/** The figures stored on every creator row (RankingEntry.stats). */
export type CreatorRankingStats = {
  minutesWatched: number | null;
  avgViewers: number | null;
  peakViewers: number | null;
  airtimeMinutes: number | null;
  followers: number | null;
  followerDelta30d: number | null;
  followerPct30d: number | null;
};

export type CategoryRankingStats = {
  minutesWatched: number | null;
  avgViewers: number | null;
  airtimeMinutes: number | null;
  avgChannels: number | null;
};

const STREAM_SCOPES: RankingScope[] = [
  "all-platforms",
  "twitch",
  "youtube",
  "kick",
];
/** Follower growth is only measured on Twitch and YouTube (see the worker). */
const GROWTH_SCOPES: RankingScope[] = ["all-platforms", "twitch", "youtube"];

const SCOPE_LABEL: Record<RankingScope, string> = {
  "all-platforms": "All platforms",
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
};

const METRIC_LABEL: Record<CreatorMetric, string> = {
  "most-watched": "Most watched",
  "average-viewers": "Average viewers",
  "peak-viewers": "Peak viewers",
  "fastest-growing": "Fastest growing",
  "most-followed": "Most followed",
};

const CATEGORY_METRIC_LABEL: Record<CategoryMetric, string> = {
  "most-watched": "Most watched",
  "most-streamed": "Most streamed",
};

export function isRankingScope(value: string): value is RankingScope {
  return (RANKING_SCOPES as readonly string[]).includes(value);
}

export function isCreatorMetric(value: string): value is CreatorMetric {
  return (CREATOR_METRICS as readonly string[]).includes(value);
}

export function isCategoryMetric(value: string): value is CategoryMetric {
  return (CATEGORY_METRICS as readonly string[]).includes(value);
}

export function scopeLabel(scope: RankingScope): string {
  return SCOPE_LABEL[scope];
}

export function metricLabel(metric: CreatorMetric): string {
  return METRIC_LABEL[metric];
}

export function categoryMetricLabel(metric: CategoryMetric): string {
  return CATEGORY_METRIC_LABEL[metric];
}

/** The platform a scope stands for; null for the combined ranking. */
export function scopePlatform(scope: RankingScope): Platform | null {
  return scope === "all-platforms" ? null : scope;
}

/** Whether this ranking is published at all. */
export function rankingExists(
  scope: RankingScope,
  metric: CreatorMetric,
): boolean {
  if (metric === "most-followed") return true;
  if (metric === "fastest-growing") return GROWTH_SCOPES.includes(scope);
  return STREAM_SCOPES.includes(scope);
}

export function metricsForScope(scope: RankingScope): CreatorMetric[] {
  return CREATOR_METRICS.filter((metric) => rankingExists(scope, metric));
}

export function scopesForMetric(metric: CreatorMetric): RankingScope[] {
  return RANKING_SCOPES.filter((scope) => rankingExists(scope, metric));
}

/** Every creator ranking, in the order the hub and the sitemap list them. */
export function allCreatorRankings(): {
  scope: RankingScope;
  metric: CreatorMetric;
}[] {
  return RANKING_SCOPES.flatMap((scope) =>
    metricsForScope(scope).map((metric) => ({ scope, metric })),
  );
}

export const RANKINGS_PATH = "/rankings";

export function rankingPath(scope: RankingScope, metric: CreatorMetric) {
  return `${RANKINGS_PATH}/${scope}/${metric}`;
}

export function gameRankingPath(gameSlug: string) {
  return `${RANKINGS_PATH}/game/${gameSlug}`;
}

export function categoryRankingPath(metric: CategoryMetric) {
  return `${RANKINGS_PATH}/categories/${metric}`;
}

/** "Twitch streamers", "streamers on Instagram", "streamers". */
function scopeNoun(scope: RankingScope): string {
  if (scope === "all-platforms") return "streamers";
  if (scope === "instagram" || scope === "tiktok" || scope === "x") {
    return `streamers on ${SCOPE_LABEL[scope]}`;
  }
  return `${SCOPE_LABEL[scope]} streamers`;
}

/** The ranking as a phrase: "most watched Twitch streamers". */
export function rankingPhrase(
  scope: RankingScope,
  metric: CreatorMetric,
): string {
  const noun = scopeNoun(scope);
  switch (metric) {
    case "most-watched":
      return `most watched ${noun}`;
    case "average-viewers":
      return `${noun} by average viewers`;
    case "peak-viewers":
      return `${noun} by peak viewers`;
    case "fastest-growing":
      return `fastest growing ${noun}`;
    case "most-followed":
      return `most followed ${noun}`;
  }
}

/** One member of the ranking: "most watched Twitch streamer". */
export function rankingSingular(
  scope: RankingScope,
  metric: CreatorMetric,
): string {
  const noun = scopeNoun(scope).replace("streamers", "streamer");
  switch (metric) {
    case "most-watched":
      return `most watched ${noun}`;
    case "average-viewers":
      return `${noun} with the highest average viewers`;
    case "peak-viewers":
      return `${noun} with the highest peak viewers`;
    case "fastest-growing":
      return `fastest growing ${noun}`;
    case "most-followed":
      return `most followed ${noun}`;
  }
}

export function categoryRankingPhrase(metric: CategoryMetric): string {
  return metric === "most-watched"
    ? "most watched streaming categories"
    : "most streamed categories";
}

/** What a ranking sorts by, as it reads after "ranked by". */
export function rankedByText(
  scope: RankingScope,
  metric: CreatorMetric,
): string {
  const on =
    scope === "all-platforms"
      ? "across Twitch, YouTube and Kick"
      : `on ${SCOPE_LABEL[scope]}`;
  switch (metric) {
    case "most-watched":
      return `hours watched ${on}`;
    case "average-viewers":
      return `average viewers ${on}`;
    case "peak-viewers":
      return `peak viewers ${on}`;
    case "fastest-growing":
      return scope === "all-platforms"
        ? "followers gained on Twitch and YouTube"
        : `followers gained ${on}`;
    case "most-followed":
      return scope === "all-platforms"
        ? "total followers across every platform"
        : `followers ${on}`;
  }
}

/** The table column a ranking sorts by. */
export type CreatorColumnKey =
  | "hoursWatched"
  | "avgViewers"
  | "peakViewers"
  | "airtime"
  | "followers"
  | "growth";

export function rankedColumn(metric: CreatorMetric): CreatorColumnKey {
  switch (metric) {
    case "most-watched":
      return "hoursWatched";
    case "average-viewers":
      return "avgViewers";
    case "peak-viewers":
      return "peakViewers";
    case "fastest-growing":
      return "growth";
    case "most-followed":
      return "followers";
  }
}

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "November 2026": the month the window ends in. */
export function rankingMonth(windowEnd: Date): string {
  return monthFormatter.format(windowEnd);
}

/** "23 November 2026". */
export function rankingDay(date: Date): string {
  return dayFormatter.format(date);
}

export function windowStart(windowEnd: Date, days = RANKING_WINDOW_DAYS): Date {
  const start = new Date(windowEnd);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
