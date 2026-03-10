import type { Platform } from "@twitchmetrics/database"

type PlatformConfig = {
  displayName: string
  color: string
  iconName: string
  apiBaseUrl: string
  oauthScopes: string[]
  publicDataAvailable: string[]
  oauthUnlocks: string[]
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  twitch: {
    displayName: "Twitch",
    color: "#9146ff",
    iconName: "twitch",
    apiBaseUrl: "https://api.twitch.tv/helix",
    oauthScopes: ["user:read:email", "channel:read:subscriptions"],
    publicDataAvailable: [
      "follower_count", "channel_info", "total_views", "live_status",
      "viewer_count", "stream_title", "game_category", "vods", "clips",
      "stream_schedule", "eventsub_webhooks",
    ],
    oauthUnlocks: [
      "subscriber_count",
      "subscription_revenue",
      "cheer_revenue",
    ],
  },
  youtube: {
    displayName: "YouTube",
    color: "#ff0000",
    iconName: "youtube",
    apiBaseUrl: "https://www.googleapis.com/youtube/v3",
    oauthScopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    publicDataAvailable: [
      "subscriber_count", "total_views", "video_count", "per_video_views",
      "per_video_likes", "per_video_comments", "video_duration", "video_tags",
      "live_concurrent_viewers", "playlists",
    ],
    oauthUnlocks: [
      "watch_time_hours",
      "avg_view_duration",
      "click_through_rate",
      "audience_demographics",
      "revenue_rpm_cpm",
      "traffic_sources",
      "device_stats",
    ],
  },
  instagram: {
    displayName: "Instagram",
    color: "#e4405f",
    iconName: "instagram",
    apiBaseUrl: "https://graph.instagram.com",
    oauthScopes: [
      "instagram_basic",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
    ],
    publicDataAvailable: [
      "follower_count", "following_count", "media_count", "bio", "profile_picture",
    ],
    oauthUnlocks: [
      "story_views_interactions",
      "post_reach",
      "post_impressions",
      "audience_demographics",
      "saves_per_post",
      "profile_website_clicks",
    ],
  },
  tiktok: {
    displayName: "TikTok",
    color: "#000000",
    iconName: "music",
    apiBaseUrl: "https://open.tiktokapis.com/v2",
    oauthScopes: [
      "user.info.basic",
      "user.info.stats",
      "video.list",
    ],
    publicDataAvailable: [],
    oauthUnlocks: [
      "per_video_detailed_metrics",
      "follower_count_verified",
      "video_list_access",
    ],
  },
  x: {
    displayName: "X",
    color: "#000000",
    iconName: "twitter",
    apiBaseUrl: "https://api.twitter.com/2",
    oauthScopes: ["tweet.read", "users.read", "offline.access"],
    publicDataAvailable: [
      "followers_count", "following_count", "tweet_count", "listed_count",
      "per_tweet_likes", "per_tweet_retweets", "per_tweet_replies", "quote_count",
    ],
    oauthUnlocks: [
      "impression_count",
      "url_link_clicks",
      "profile_clicks",
    ],
  },
  kick: {
    displayName: "Kick",
    color: "#53fc18",
    iconName: "play",
    apiBaseUrl: "https://kick.com/api/v2",
    oauthScopes: [],
    publicDataAvailable: [
      "follower_count", "is_live", "viewer_count",
    ],
    oauthUnlocks: [],
  },
}
