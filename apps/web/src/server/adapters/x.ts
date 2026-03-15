import type { Platform } from "@twitchmetrics/database";
import type {
  PlatformAdapter,
  CreatorProfileData,
  CreatorSnapshotData,
  SearchResult,
} from "./types";
import { AdapterError } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("x-adapter");

const X_API_BASE = "https://api.twitter.com/2";

// ============================================================
// X API v2 RESPONSE TYPES
// ============================================================

type XUser = {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  description?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
    like_count?: number;
  };
};

type XUserResponse = {
  data?: XUser;
  errors?: Array<{
    detail: string;
    title: string;
    type: string;
  }>;
};

// ============================================================
// HTTP HELPER
// ============================================================

function getBearerToken(): string {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    throw new AdapterError(
      "x",
      "api_error",
      "TWITTER_BEARER_TOKEN not configured",
    );
  }
  return token;
}

async function xApiFetch<T>(path: string): Promise<T> {
  const bearerToken = getBearerToken();

  const res = await fetch(`${X_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });

  if (res.status === 401) {
    throw new AdapterError(
      "x",
      "auth_expired",
      "X API bearer token is invalid or expired",
    );
  }

  if (res.status === 429) {
    throw new AdapterError("x", "rate_limited", "X API rate limited", true);
  }

  if (res.status === 404) {
    throw new AdapterError("x", "not_found", "X user not found");
  }

  if (res.status >= 500) {
    throw new AdapterError(
      "x",
      "api_error",
      `X API server error: ${res.status}`,
      true,
    );
  }

  if (!res.ok) {
    throw new AdapterError(
      "x",
      "api_error",
      `X API error: ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as T;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (err instanceof AdapterError && !err.retryable) {
        throw err;
      }
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 15_000);
        log.warn({ attempt, delay, error: (err as Error).message }, "Retrying");
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ============================================================
// X ADAPTER IMPLEMENTATION
// ============================================================

const USER_FIELDS = "public_metrics,profile_image_url,description";

class XAdapter implements PlatformAdapter {
  readonly platform: Platform = "x";

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    return withRetry(async () => {
      const encodedUsername = encodeURIComponent(
        platformUsername.replace(/^@/, ""),
      );
      const data = await xApiFetch<XUserResponse>(
        `/users/by/username/${encodedUsername}?user.fields=${USER_FIELDS}`,
      );

      if (!data.data) {
        if (data.errors?.length) {
          log.warn({ errors: data.errors }, "X API returned errors");
        }
        throw new AdapterError(
          "x",
          "not_found",
          `User @${platformUsername} not found on X`,
        );
      }

      const user = data.data;
      const metrics = user.public_metrics;

      return {
        platform: "x" as Platform,
        platformUserId: user.id,
        platformUsername: user.username,
        platformDisplayName: user.name,
        platformUrl: `https://x.com/${user.username}`,
        platformAvatarUrl: user.profile_image_url ?? null,
        followerCount: metrics ? BigInt(metrics.followers_count) : null,
        followingCount: metrics ? BigInt(metrics.following_count) : null,
        totalViews: null, // Not available at Basic tier
        postCount: metrics?.tweet_count ?? null,
        isLive: null, // X doesn't have a live streaming indicator
      };
    });
  }

  async fetchSnapshot(
    platformUserId: string,
    _options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    return withRetry(async () => {
      const data = await xApiFetch<XUserResponse>(
        `/users/${encodeURIComponent(platformUserId)}?user.fields=${USER_FIELDS}`,
      );

      if (!data.data) {
        throw new AdapterError(
          "x",
          "not_found",
          `X user ID '${platformUserId}' not found`,
        );
      }

      const user = data.data;
      const metrics = user.public_metrics;

      return {
        platform: "x" as Platform,
        platformUserId,
        snapshotAt: new Date(),
        followerCount: metrics ? BigInt(metrics.followers_count) : null,
        followingCount: metrics ? BigInt(metrics.following_count) : null,
        totalViews: null, // Not available at Basic tier
        subscriberCount: null, // Not applicable
        postCount: metrics?.tweet_count ?? null,
        extendedMetrics: {
          // Store listed_count as extended metric for reference
          ...(metrics?.listed_count != null
            ? { LIKES: BigInt(metrics.listed_count) }
            : {}),
        },
      };
    });
  }

  async search(_query: string, _limit?: number): Promise<SearchResult[]> {
    // X search API (recent search) is very limited at Basic tier
    // and costs additional quota. Return empty for now.
    return [];
  }
}

export const xAdapter = new XAdapter();
