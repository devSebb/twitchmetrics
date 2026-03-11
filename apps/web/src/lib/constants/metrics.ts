import type { Platform } from "@twitchmetrics/database";

export type MetricFormat =
  | "number"
  | "percentage"
  | "duration_seconds"
  | "currency_usd";

export type MetricDefinition = {
  key: string;
  label: string;
  description: string;
  format: MetricFormat;
  platforms: readonly Platform[];
  requiresOAuth: boolean;
  snapshotField: string;
};

const ALL_PLATFORMS = [
  "twitch",
  "youtube",
  "instagram",
  "tiktok",
  "x",
  "kick",
] as const satisfies readonly Platform[];

export const METRICS = {
  FOLLOWERS: {
    key: "FOLLOWERS",
    label: "Followers",
    description: "Total follower count across the platform",
    format: "number",
    platforms: ALL_PLATFORMS,
    requiresOAuth: false,
    snapshotField: "followerCount",
  },
  FOLLOWING: {
    key: "FOLLOWING",
    label: "Following",
    description: "Number of accounts being followed",
    format: "number",
    platforms: [
      "twitch",
      "instagram",
      "tiktok",
      "x",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "followingCount",
  },
  TOTAL_VIEWS: {
    key: "TOTAL_VIEWS",
    label: "Total Views",
    description: "Cumulative view count across all content",
    format: "number",
    platforms: ["twitch", "youtube"] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "totalViews",
  },
  SUBSCRIBER_COUNT: {
    key: "SUBSCRIBER_COUNT",
    label: "Subscribers",
    description: "Total subscriber or paid follower count",
    format: "number",
    platforms: ["youtube", "twitch"] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "subscriberCount",
  },
  POST_COUNT: {
    key: "POST_COUNT",
    label: "Posts / Videos",
    description: "Total number of posts, videos, or uploads",
    format: "number",
    platforms: [
      "youtube",
      "instagram",
      "tiktok",
      "x",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "postCount",
  },
  VIDEO_COUNT: {
    key: "VIDEO_COUNT",
    label: "Video Count",
    description: "Total number of uploaded videos",
    format: "number",
    platforms: ["youtube"] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "postCount",
  },
  AVG_VIEWERS: {
    key: "AVG_VIEWERS",
    label: "Avg Viewers",
    description: "Average concurrent viewers during live streams",
    format: "number",
    platforms: [
      "twitch",
      "youtube",
      "kick",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "extendedMetrics",
  },
  PEAK_VIEWERS: {
    key: "PEAK_VIEWERS",
    label: "Peak Viewers",
    description: "Highest concurrent viewer count during a stream",
    format: "number",
    platforms: [
      "twitch",
      "youtube",
      "kick",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "extendedMetrics",
  },
  LIVE_VIEWER_COUNT: {
    key: "LIVE_VIEWER_COUNT",
    label: "Live Viewers",
    description: "Current live viewer count if streaming",
    format: "number",
    platforms: [
      "twitch",
      "youtube",
      "kick",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "extendedMetrics",
  },
  ENGAGEMENT_RATE: {
    key: "ENGAGEMENT_RATE",
    label: "Engagement Rate",
    description: "Ratio of interactions to followers or impressions",
    format: "percentage",
    platforms: [
      "instagram",
      "tiktok",
      "x",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "extendedMetrics",
  },
  LIKES: {
    key: "LIKES",
    label: "Likes",
    description: "Total likes across recent content",
    format: "number",
    platforms: [
      "youtube",
      "instagram",
      "tiktok",
      "x",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "extendedMetrics",
  },
  COMMENTS: {
    key: "COMMENTS",
    label: "Comments",
    description: "Total comments across recent content",
    format: "number",
    platforms: [
      "youtube",
      "instagram",
      "tiktok",
      "x",
    ] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "extendedMetrics",
  },
  SHARES: {
    key: "SHARES",
    label: "Shares",
    description: "Total shares across recent content",
    format: "number",
    platforms: ["instagram", "tiktok"] as const satisfies readonly Platform[],
    requiresOAuth: false,
    snapshotField: "extendedMetrics",
  },
  IMPRESSIONS: {
    key: "IMPRESSIONS",
    label: "Impressions",
    description: "Total number of times content was displayed",
    format: "number",
    platforms: ["instagram", "x"] as const satisfies readonly Platform[],
    requiresOAuth: true,
    snapshotField: "extendedMetrics",
  },
  REACH: {
    key: "REACH",
    label: "Reach",
    description: "Unique accounts that saw content",
    format: "number",
    platforms: ["instagram"] as const satisfies readonly Platform[],
    requiresOAuth: true,
    snapshotField: "extendedMetrics",
  },
  WATCH_TIME: {
    key: "WATCH_TIME",
    label: "Watch Time (hrs)",
    description: "Total watch time in hours across all content",
    format: "duration_seconds",
    platforms: ["youtube"] as const satisfies readonly Platform[],
    requiresOAuth: true,
    snapshotField: "extendedMetrics",
  },
  SUBSCRIBER_REVENUE: {
    key: "SUBSCRIBER_REVENUE",
    label: "Sub Revenue",
    description: "Revenue from subscriptions",
    format: "currency_usd",
    platforms: ["twitch"] as const satisfies readonly Platform[],
    requiresOAuth: true,
    snapshotField: "extendedMetrics",
  },
  CHEER_REVENUE: {
    key: "CHEER_REVENUE",
    label: "Bits Revenue",
    description: "Revenue from Twitch Bits / cheers",
    format: "currency_usd",
    platforms: ["twitch"] as const satisfies readonly Platform[],
    requiresOAuth: true,
    snapshotField: "extendedMetrics",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRICS;

export function getMetricsForPlatform(platform: Platform): MetricKey[] {
  return (Object.keys(METRICS) as MetricKey[]).filter((key) =>
    (METRICS[key].platforms as readonly Platform[]).includes(platform),
  );
}
