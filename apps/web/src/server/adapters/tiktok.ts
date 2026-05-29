import type { Platform } from "@twitchmetrics/database";
import type { MetricKey } from "@/lib/constants/metrics";
import type {
  PlatformAdapter,
  CreatorProfileData,
  CreatorSnapshotData,
  SearchResult,
} from "./types";
import { AdapterError } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("tiktok-adapter");

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";
const USER_INFO_FIELDS = [
  "open_id",
  "union_id",
  "avatar_url",
  "display_name",
  "bio_description",
  "profile_deep_link",
  "username",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
].join(",");
const VIDEO_LIST_FIELDS = [
  "id",
  "create_time",
  "share_url",
  "title",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
].join(",");

// ============================================================
// TIKTOK API RESPONSE TYPES (for when app is approved)
// ============================================================

type TikTokUserInfoResponse = {
  data?: {
    user: {
      open_id: string;
      union_id?: string;
      avatar_url?: string;
      display_name?: string;
      follower_count?: number;
      following_count?: number;
      likes_count?: number;
      video_count?: number;
      bio_description?: string;
      profile_deep_link?: string;
      username?: string;
    };
  };
  error?: {
    code: string;
    message: string;
    log_id?: string;
  };
};

type TikTokVideo = {
  id: string;
  create_time?: number;
  share_url?: string;
  title?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
};

type TikTokVideoListResponse = {
  data?: {
    videos?: TikTokVideo[];
    cursor?: number;
    has_more?: boolean;
  };
  error?: {
    code: string;
    message: string;
    log_id?: string;
  };
};

type TikTokErrorBody = {
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

function toBigInt(value: number | undefined): bigint | null {
  return typeof value === "number" && Number.isFinite(value)
    ? BigInt(value)
    : null;
}

function toNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function parseTikTokResponse<T>(
  platformUserId: string,
  response: Response,
): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & TikTokErrorBody;
  const error = json.error;

  if (
    !response.ok ||
    (error?.code && error.code !== "ok" && error.code !== "success")
  ) {
    const message = error?.message || `TikTok API error: ${response.status}`;
    const logId = error?.log_id ? ` (log_id: ${error.log_id})` : "";

    if (response.status === 401 || response.status === 403) {
      throw new AdapterError("tiktok", "auth_expired", `${message}${logId}`);
    }

    if (response.status === 429 || error?.code === "rate_limit_exceeded") {
      throw new AdapterError(
        "tiktok",
        "rate_limited",
        `${message}${logId}`,
        true,
      );
    }

    throw new AdapterError(
      "tiktok",
      "api_error",
      `${message}${logId}`,
      response.status >= 500,
    );
  }

  log.debug({ platformUserId, logId: error?.log_id }, "TikTok API response ok");
  return json as T;
}

async function tiktokGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  platformUserId: string,
): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseTikTokResponse<T>(platformUserId, response);
}

async function tiktokPost<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  body: unknown,
  platformUserId: string,
): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseTikTokResponse<T>(platformUserId, response);
}

// ============================================================
// TIKTOK ADAPTER IMPLEMENTATION
// ============================================================

class TikTokAdapter implements PlatformAdapter {
  readonly platform: Platform = "tiktok";

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    throw new AdapterError(
      "tiktok",
      "api_error",
      `TikTok username lookup is unavailable for '${platformUsername}' without user OAuth consent`,
    );
  }

  async fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    if (!options.isOAuthConnected || !options.accessToken) {
      throw new AdapterError(
        "tiktok",
        "auth_expired",
        "TikTok requires OAuth connection for snapshots",
      );
    }

    const userInfo = await tiktokGet<TikTokUserInfoResponse>(
      "/user/info/",
      options.accessToken,
      { fields: USER_INFO_FIELDS },
      platformUserId,
    );
    const user = userInfo.data?.user;
    if (!user?.open_id) {
      throw new AdapterError(
        "tiktok",
        "api_error",
        "TikTok user info did not return open_id",
      );
    }

    const videoList = await tiktokPost<TikTokVideoListResponse>(
      "/video/list/",
      options.accessToken,
      { fields: VIDEO_LIST_FIELDS },
      { max_count: 20 },
      platformUserId,
    );
    const videos = videoList.data?.videos ?? [];
    const recentLikes = videos.reduce(
      (sum, video) => sum + toNumber(video.like_count),
      0,
    );
    const recentComments = videos.reduce(
      (sum, video) => sum + toNumber(video.comment_count),
      0,
    );
    const recentShares = videos.reduce(
      (sum, video) => sum + toNumber(video.share_count),
      0,
    );
    const recentViews = videos.reduce(
      (sum, video) => sum + toNumber(video.view_count),
      0,
    );
    const recentEngagements = recentLikes + recentComments + recentShares;
    const recentEngagementRate =
      recentViews > 0 ? recentEngagements / recentViews : null;

    const extendedMetrics: Partial<
      Record<MetricKey, number | bigint | string | null>
    > &
      Record<string, number | bigint | string | null> = {
      LIKES: toBigInt(user.likes_count),
      COMMENTS: recentComments,
      SHARES: recentShares,
      ENGAGEMENT_RATE: recentEngagementRate,
      RECENT_VIDEO_VIEWS: recentViews,
      RECENT_VIDEO_COUNT: videos.length,
      _bio: user.bio_description ?? null,
      _avatarUrl: user.avatar_url ?? null,
      _displayName: user.display_name ?? null,
      _username: user.username ?? null,
      _profileUrl:
        user.profile_deep_link ??
        (user.username ? `https://www.tiktok.com/@${user.username}` : null),
    };

    return {
      platform: "tiktok",
      platformUserId: user.open_id || platformUserId,
      snapshotAt: new Date(),
      followerCount: toBigInt(user.follower_count),
      followingCount: toBigInt(user.following_count),
      totalViews: null,
      subscriberCount: null,
      postCount:
        typeof user.video_count === "number" &&
        Number.isFinite(user.video_count)
          ? user.video_count
          : null,
      extendedMetrics,
    };
  }

  async search(_query: string, _limit?: number): Promise<SearchResult[]> {
    // TikTok API does not expose a public search endpoint
    return [];
  }
}

export const tiktokAdapter = new TikTokAdapter();
