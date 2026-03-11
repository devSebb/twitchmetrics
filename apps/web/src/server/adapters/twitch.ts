import type { Platform } from "@twitchmetrics/database";
import type { MetricKey } from "@/lib/constants/metrics";
import {
  type PlatformAdapter,
  type CreatorProfileData,
  type CreatorSnapshotData,
  type GameSnapshotData,
  type SearchResult,
  AdapterError,
} from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("twitch-adapter");

const HELIX_BASE = "https://api.twitch.tv/helix";
const OAUTH_URL = "https://id.twitch.tv/oauth2/token";

// ============================================================
// APP ACCESS TOKEN MANAGEMENT
// ============================================================

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AdapterError(
      "twitch",
      "auth_expired",
      "TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set",
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch(`${OAUTH_URL}?${params.toString()}`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new AdapterError(
      "twitch",
      "auth_expired",
      `Failed to obtain app access token: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  log.info("Obtained new Twitch app access token");
  return cachedToken.token;
}

/**
 * Expose the app access token for other consumers (e.g. IGDB API).
 */
export async function getTwitchAppToken(): Promise<string> {
  return getAppAccessToken();
}

// ============================================================
// HTTP HELPERS
// ============================================================

async function helixFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const token = await getAppAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID!;

  const url = new URL(`${HELIX_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
    },
  });

  if (res.status === 401) {
    // Invalidate cached token and retry once
    cachedToken = null;
    const freshToken = await getAppAccessToken();
    const retry = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Client-Id": clientId,
      },
    });
    if (!retry.ok) {
      throw new AdapterError(
        "twitch",
        "auth_expired",
        `Helix ${path} returned ${retry.status} after token refresh`,
      );
    }
    return (await retry.json()) as T;
  }

  if (res.status === 404) {
    throw new AdapterError("twitch", "not_found", `Helix ${path}: not found`);
  }

  if (res.status === 429) {
    throw new AdapterError(
      "twitch",
      "rate_limited",
      `Helix ${path}: rate limited`,
      true,
    );
  }

  if (res.status >= 500) {
    throw new AdapterError(
      "twitch",
      "api_error",
      `Helix ${path}: server error ${res.status}`,
      true,
    );
  }

  if (!res.ok) {
    throw new AdapterError(
      "twitch",
      "api_error",
      `Helix ${path}: ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as T;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
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
        const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
        log.warn({ attempt, delay, error: (err as Error).message }, "Retrying");
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ============================================================
// TWITCH API RESPONSE TYPES
// ============================================================

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  created_at: string;
};

type TwitchStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tags: string[];
};

type TwitchChannel = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  broadcaster_language: string;
  game_id: string;
  game_name: string;
  title: string;
  delay: number;
  tags: string[];
  is_branded_content: boolean;
};

type TwitchGame = {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id: string;
};

type TwitchSearchChannel = {
  id: string;
  broadcaster_login: string;
  display_name: string;
  game_id: string;
  game_name: string;
  is_live: boolean;
  thumbnail_url: string;
  title: string;
  started_at: string;
};

type PaginatedResponse<T> = {
  data: T[];
  pagination?: { cursor?: string };
  total?: number;
};

// ============================================================
// TWITCH ADAPTER IMPLEMENTATION
// ============================================================

export const twitchAdapter: PlatformAdapter = {
  platform: "twitch" as Platform,

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    return withRetry(async () => {
      const users = await helixFetch<PaginatedResponse<TwitchUser>>("/users", {
        login: platformUsername,
      });

      if (!users.data.length) {
        throw new AdapterError(
          "twitch",
          "not_found",
          `User '${platformUsername}' not found on Twitch`,
        );
      }

      const user = users.data[0]!;

      // Get follower count
      const followers = await helixFetch<
        PaginatedResponse<unknown> & { total: number }
      >("/channels/followers", { broadcaster_id: user.id, first: "1" });

      return {
        platform: "twitch" as Platform,
        platformUserId: user.id,
        platformUsername: user.login,
        platformDisplayName: user.display_name,
        platformUrl: `https://twitch.tv/${user.login}`,
        platformAvatarUrl: user.profile_image_url,
        followerCount: BigInt(followers.total ?? 0),
        followingCount: null, // Not available via Helix without user token
        totalViews: BigInt(user.view_count ?? 0), // Deprecated, may be 0
        postCount: null,
        isLive: null, // Would need separate streams check
        rawResponse: { user, followers: { total: followers.total } },
      };
    });
  },

  async fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    return withRetry(async () => {
      // Fetch user data
      const users = await helixFetch<PaginatedResponse<TwitchUser>>("/users", {
        id: platformUserId,
      });

      if (!users.data.length) {
        throw new AdapterError(
          "twitch",
          "not_found",
          `User ID '${platformUserId}' not found`,
        );
      }

      const user = users.data[0]!;

      // Fetch follower count
      const followers = await helixFetch<
        PaginatedResponse<unknown> & { total: number }
      >("/channels/followers", { broadcaster_id: platformUserId, first: "1" });

      // Fetch stream info (check if live)
      const streams = await helixFetch<PaginatedResponse<TwitchStream>>(
        "/streams",
        { user_id: platformUserId },
      );

      const stream = streams.data[0] ?? null;
      const isLive = stream?.type === "live";

      const extendedMetrics: Partial<
        Record<MetricKey, number | bigint | string | null>
      > = {};

      if (isLive && stream) {
        extendedMetrics.LIVE_VIEWER_COUNT = stream.viewer_count;
        extendedMetrics.PEAK_VIEWERS = stream.viewer_count; // Current snapshot peak
      }

      // Fetch channel info for game data
      const channels = await helixFetch<PaginatedResponse<TwitchChannel>>(
        "/channels",
        { broadcaster_id: platformUserId },
      );
      const channel = channels.data[0] ?? null;

      return {
        platform: "twitch" as Platform,
        platformUserId,
        snapshotAt: new Date(),
        followerCount: BigInt(followers.total ?? 0),
        followingCount: null,
        totalViews: BigInt(user.view_count ?? 0),
        subscriberCount: null, // Requires user OAuth
        postCount: null,
        extendedMetrics: {
          ...extendedMetrics,
          // Store game info in extended metrics for reference
          ...(channel
            ? {
                AVG_VIEWERS: isLive ? (stream?.viewer_count ?? null) : null,
              }
            : {}),
        },
      };
    });
  },

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    return withRetry(async () => {
      const results = await helixFetch<PaginatedResponse<TwitchSearchChannel>>(
        "/search/channels",
        { query, first: String(Math.min(limit, 100)) },
      );

      return results.data.map((ch) => ({
        platform: "twitch" as Platform,
        platformUserId: ch.id,
        platformUsername: ch.broadcaster_login,
        platformDisplayName: ch.display_name,
        platformAvatarUrl: ch.thumbnail_url,
        followerCount: null, // Not returned by search endpoint
        isLive: ch.is_live,
      }));
    });
  },

  async fetchTopGames(limit: number = 20): Promise<GameSnapshotData[]> {
    return withRetry(async () => {
      const games = await helixFetch<PaginatedResponse<TwitchGame>>(
        "/games/top",
        { first: String(Math.min(limit, 100)) },
      );

      const snapshots: GameSnapshotData[] = [];
      const now = new Date();

      for (const game of games.data) {
        // Fetch stream count for this game
        const streams = await helixFetch<
          PaginatedResponse<TwitchStream> & { pagination?: { cursor?: string } }
        >("/streams", { game_id: game.id, first: "1" });

        // The total isn't available directly; we get viewer_count from first stream
        // For accurate counts, we'd need to paginate — approximate with first page
        snapshots.push({
          platform: "twitch" as Platform,
          platformGameId: game.id,
          gameName: game.name,
          snapshotAt: now,
          viewerCount: streams.data[0]?.viewer_count ?? 0,
          channelCount: streams.data.length, // Approximation from first page
        });
      }

      return snapshots;
    });
  },
};
