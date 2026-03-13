import type { Platform } from "@twitchmetrics/database";
import {
  type PlatformAdapter,
  type CreatorProfileData,
  type CreatorSnapshotData,
  type SearchResult,
  AdapterError,
} from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("youtube-adapter");

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// ============================================================
// YOUTUBE API RESPONSE TYPES
// ============================================================

type YouTubeChannelListResponse = {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      customUrl?: string;
      thumbnails: {
        default?: { url: string };
        high?: { url: string };
      };
      country?: string;
    };
    statistics: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
      hiddenSubscriberCount: boolean;
    };
  }>;
  pageInfo: { totalResults: number };
};

type YouTubeSearchListResponse = {
  items?: Array<{
    id: { channelId?: string; videoId?: string };
    snippet: {
      channelId: string;
      channelTitle: string;
      title: string;
      thumbnails: {
        default?: { url: string };
        high?: { url: string };
      };
    };
  }>;
  pageInfo: { totalResults: number };
};

// ============================================================
// QUOTA TRACKING (YouTube Data API v3: 10,000 units/day)
// ============================================================

let dailyQuotaUsed = 0;
let quotaResetDate = new Date().toISOString().slice(0, 10);

function trackQuota(units: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaResetDate) {
    dailyQuotaUsed = 0;
    quotaResetDate = today;
  }
  dailyQuotaUsed += units;
  if (dailyQuotaUsed > 8000) {
    log.warn({ dailyQuotaUsed }, "YouTube API quota approaching limit (80%)");
  }
}

function assertQuotaAvailable(units: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaResetDate) {
    dailyQuotaUsed = 0;
    quotaResetDate = today;
  }
  if (dailyQuotaUsed + units > 9500) {
    throw new AdapterError(
      "youtube",
      "rate_limited",
      "YouTube daily quota nearly exhausted",
      true,
    );
  }
}

/** Read-only quota counter for monitoring. */
export function getQuotaUsed(): number {
  return dailyQuotaUsed;
}

// ============================================================
// HTTP HELPER
// ============================================================

async function youtubeApiFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new AdapterError(
      "youtube",
      "api_error",
      "YOUTUBE_API_KEY not configured",
    );
  }

  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());

  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { errors?: Array<{ reason?: string }> };
    };
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") {
      throw new AdapterError(
        "youtube",
        "rate_limited",
        "YouTube API quota exceeded",
        true,
      );
    }
    throw new AdapterError(
      "youtube",
      "api_error",
      `YouTube API 403: ${reason ?? "forbidden"}`,
    );
  }

  if (res.status === 404) {
    throw new AdapterError("youtube", "not_found", "YouTube channel not found");
  }

  if (!res.ok) {
    throw new AdapterError(
      "youtube",
      "api_error",
      `YouTube API error: ${res.status}`,
      res.status >= 500,
    );
  }

  return res.json() as Promise<T>;
}

// ============================================================
// YOUTUBE ADAPTER IMPLEMENTATION
// ============================================================

export const youtubeAdapter: PlatformAdapter = {
  platform: "youtube" as Platform,

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    assertQuotaAvailable(3);

    // Try forHandle first (e.g. @MrBeast), fallback to forUsername
    let data = await youtubeApiFetch<YouTubeChannelListResponse>("channels", {
      part: "snippet,statistics",
      forHandle: platformUsername.replace(/^@/, ""),
    });
    trackQuota(3);

    if (!data.items || data.items.length === 0) {
      // Fallback: try forUsername
      assertQuotaAvailable(3);
      data = await youtubeApiFetch<YouTubeChannelListResponse>("channels", {
        part: "snippet,statistics",
        forUsername: platformUsername.replace(/^@/, ""),
      });
      trackQuota(3);
    }

    if (!data.items || data.items.length === 0) {
      throw new AdapterError(
        "youtube",
        "not_found",
        `YouTube channel '${platformUsername}' not found`,
      );
    }

    const channel = data.items[0]!;
    const stats = channel.statistics;
    const snippet = channel.snippet;

    const subscriberCount = stats.hiddenSubscriberCount
      ? null
      : stats.subscriberCount
        ? BigInt(stats.subscriberCount)
        : null;

    return {
      platform: "youtube" as Platform,
      platformUserId: channel.id,
      platformUsername: snippet.customUrl ?? channel.id,
      platformDisplayName: snippet.title,
      platformUrl: `https://youtube.com/${snippet.customUrl ?? `channel/${channel.id}`}`,
      platformAvatarUrl:
        snippet.thumbnails.high?.url ?? snippet.thumbnails.default?.url ?? null,
      followerCount: subscriberCount,
      followingCount: null,
      totalViews: stats.viewCount ? BigInt(stats.viewCount) : null,
      postCount: stats.videoCount ? parseInt(stats.videoCount, 10) : null,
      isLive: null,
    };
  },

  async fetchSnapshot(
    platformUserId: string,
    _options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    assertQuotaAvailable(3);

    const data = await youtubeApiFetch<YouTubeChannelListResponse>("channels", {
      part: "statistics",
      id: platformUserId,
    });
    trackQuota(3);

    if (!data.items || data.items.length === 0) {
      throw new AdapterError(
        "youtube",
        "not_found",
        `YouTube channel ID '${platformUserId}' not found`,
      );
    }

    const stats = data.items[0]!.statistics;

    const subscriberCount = stats.hiddenSubscriberCount
      ? null
      : stats.subscriberCount
        ? BigInt(stats.subscriberCount)
        : null;

    return {
      platform: "youtube" as Platform,
      platformUserId,
      snapshotAt: new Date(),
      followerCount: subscriberCount,
      followingCount: null,
      totalViews: stats.viewCount ? BigInt(stats.viewCount) : null,
      subscriberCount,
      postCount: stats.videoCount ? parseInt(stats.videoCount, 10) : null,
      extendedMetrics: {},
    };
  },

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    // search.list costs 100 units — expensive!
    assertQuotaAvailable(100);

    log.info(
      { query, limit, quotaUsed: dailyQuotaUsed },
      "YouTube search (100 units)",
    );

    const data = await youtubeApiFetch<YouTubeSearchListResponse>("search", {
      part: "snippet",
      type: "channel",
      q: query,
      maxResults: String(Math.min(limit, 25)),
    });
    trackQuota(100);

    if (!data.items || data.items.length === 0) {
      return [];
    }

    return data.items
      .filter((item) => item.id.channelId)
      .map((item) => ({
        platform: "youtube" as Platform,
        platformUserId: item.id.channelId!,
        platformUsername: item.snippet.channelId,
        platformDisplayName: item.snippet.channelTitle,
        platformAvatarUrl:
          item.snippet.thumbnails.high?.url ??
          item.snippet.thumbnails.default?.url ??
          null,
        followerCount: null,
        isLive: null,
      }));
  },
};
