import { Platform } from "@twitchmetrics/database";
import type { MetricKey } from "./metrics";

export { Platform } from "@twitchmetrics/database";

export type AdapterStatus = "stable" | "beta" | "planned" | "unavailable";

export type PlatformConfigEntry = {
  name: string;
  color: string;
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
    adapterStatus: "planned",
  },
  youtube: {
    name: "YouTube",
    color: "#ff0000",
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
    adapterStatus: "planned",
  },
  instagram: {
    name: "Instagram",
    color: "#e4405f",
    iconName: "instagram",
    apiBaseUrl: "https://graph.instagram.com",
    oauthSupported: false,
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
    color: "#000000",
    iconName: "music",
    apiBaseUrl: "https://open.tiktokapis.com/v2",
    oauthSupported: false,
    oauthScopes: ["user.info.basic", "user.info.stats", "video.list"],
    tier0Metrics: [],
    requiresUserConsent: [],
    adapterStatus: "planned",
  },
  x: {
    name: "X",
    color: "#000000",
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
    iconName: "play",
    apiBaseUrl: "https://kick.com/api/v2",
    oauthSupported: false,
    oauthScopes: [],
    tier0Metrics: ["FOLLOWERS", "LIVE_VIEWER_COUNT"],
    requiresUserConsent: [],
    adapterStatus: "unavailable",
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
