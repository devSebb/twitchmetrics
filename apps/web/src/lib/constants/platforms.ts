import { Platform } from "@twitchmetrics/database";
import type { MetricKey } from "./metrics";

export { Platform } from "@twitchmetrics/database";

export type AdapterStatus = "stable" | "beta" | "planned" | "unavailable";

export type PlatformConfigEntry = {
  name: string;
  color: string;
  foregroundColor: string;
  iconName: string;
  apiBaseUrl: string;
  oauthSupported: boolean;
  oauthScopes: readonly string[];
  tier0Metrics: readonly MetricKey[];
  requiresUserConsent: readonly MetricKey[];
  adapterStatus: AdapterStatus;
};

export const PLATFORM_CONFIG: Record<Platform, PlatformConfigEntry> = {
  twitch: {
    name: "Twitch",
    color: "#9146ff",
    foregroundColor: "#ffffff",
    iconName: "twitch",
    apiBaseUrl: "https://api.twitch.tv/helix",
    oauthSupported: true,
    oauthScopes: ["user:read:email", "channel:read:subscriptions"],
    tier0Metrics: [
      "FOLLOWERS",
      "TOTAL_VIEWS",
      "AVG_VIEWERS",
      "PEAK_VIEWERS",
      "LIVE_VIEWER_COUNT",
    ],
    requiresUserConsent: [
      "SUBSCRIBER_COUNT",
      "SUBSCRIBER_REVENUE",
      "CHEER_REVENUE",
    ],
    adapterStatus: "stable",
  },
  youtube: {
    name: "YouTube",
    color: "#ff0000",
    foregroundColor: "#ffffff",
    iconName: "youtube",
    apiBaseUrl: "https://www.googleapis.com/youtube/v3",
    oauthSupported: true,
    oauthScopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    tier0Metrics: [
      "FOLLOWERS",
      "TOTAL_VIEWS",
      "VIDEO_COUNT",
      "SUBSCRIBER_COUNT",
      "LIKES",
      "COMMENTS",
      "AVG_VIEWERS",
      "LIVE_VIEWER_COUNT",
    ],
    requiresUserConsent: ["WATCH_TIME"],
    adapterStatus: "beta",
  },
  instagram: {
    name: "Instagram",
    color: "#e4405f",
    foregroundColor: "#ffffff",
    iconName: "instagram",
    apiBaseUrl: "https://graph.instagram.com",
    oauthSupported: true,
    oauthScopes: [
      "instagram_basic",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
    ],
    tier0Metrics: ["FOLLOWERS", "FOLLOWING", "POST_COUNT"],
    requiresUserConsent: ["IMPRESSIONS", "REACH"],
    adapterStatus: "planned",
  },
  tiktok: {
    name: "TikTok",
    color: "#69C9D0",
    foregroundColor: "#1E1F22",
    iconName: "music",
    apiBaseUrl: "https://open.tiktokapis.com/v2",
    oauthSupported: true,
    oauthScopes: [
      "user.info.basic",
      "user.info.profile",
      "user.info.stats",
      "video.list",
    ],
    tier0Metrics: [
      "FOLLOWERS",
      "FOLLOWING",
      "POST_COUNT",
      "LIKES",
      "COMMENTS",
      "SHARES",
      "ENGAGEMENT_RATE",
    ],
    requiresUserConsent: [
      "FOLLOWERS",
      "FOLLOWING",
      "POST_COUNT",
      "LIKES",
      "COMMENTS",
      "SHARES",
      "ENGAGEMENT_RATE",
    ],
    adapterStatus: "beta",
  },
  x: {
    name: "X",
    color: "#F2F3F5",
    foregroundColor: "#1E1F22",
    iconName: "twitter",
    apiBaseUrl: "https://api.twitter.com/2",
    oauthSupported: true,
    oauthScopes: ["tweet.read", "users.read", "offline.access"],
    tier0Metrics: ["FOLLOWERS", "FOLLOWING", "POST_COUNT", "LIKES", "COMMENTS"],
    requiresUserConsent: ["IMPRESSIONS"],
    adapterStatus: "planned",
  },
  kick: {
    name: "Kick",
    color: "#53fc18",
    foregroundColor: "#1E1F22",
    iconName: "play",
    apiBaseUrl: "https://api.kick.com",
    oauthSupported: true,
    oauthScopes: ["user:read", "channel:read"],
    tier0Metrics: ["FOLLOWERS", "LIVE_VIEWER_COUNT"],
    requiresUserConsent: [],
    adapterStatus: "beta",
  },
};

export const SUPPORTED_PLATFORMS: Platform[] = Object.values(Platform);

export function getPlatformConfig(platform: Platform): PlatformConfigEntry {
  return PLATFORM_CONFIG[platform];
}

export function getActivePlatforms(): Platform[] {
  return (Object.keys(PLATFORM_CONFIG) as Platform[]).filter((p) => {
    const status = PLATFORM_CONFIG[p].adapterStatus;
    return status === "stable" || status === "beta";
  });
}
