import type { Platform } from "@twitchmetrics/database";
import type { MetricKey } from "@/lib/constants/metrics";
import {
  type PlatformAdapter,
  type CreatorProfileData,
  type CreatorSnapshotData,
  type GameCatalogData,
  type GameLiveStatsData,
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

type TwitchClip = {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
};

type TwitchVideo = {
  id: string;
  stream_id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
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

// ============================================================
// EXTENSION METHODS (not part of PlatformAdapter interface)
// ============================================================

export type ClipData = {
  id: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  createdAt: string;
  url: string;
  duration: number;
  language: string | null;
  gameId: string | null;
};

export type TwitchUserDetail = {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  viewCount: number;
};

/**
 * Batch-fetch user details by Twitch user IDs (max 100 per call).
 */
export async function fetchUserDetailsByIds(
  userIds: string[],
): Promise<TwitchUserDetail[]> {
  if (userIds.length === 0) return [];
  return withRetry(async () => {
    const results: TwitchUserDetail[] = [];
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const query = batch.map((id) => `id=${id}`).join("&");
      const res = await helixFetch<PaginatedResponse<TwitchUser>>(
        `/users?${query}`,
      );
      for (const u of res.data) {
        results.push({
          id: u.id,
          login: u.login,
          displayName: u.display_name,
          avatarUrl: u.profile_image_url,
          bio: u.description,
          viewCount: u.view_count,
        });
      }
    }
    return results;
  });
}

/**
 * Fetch top live streams globally (not filtered by game).
 * Uses GET /streams?first=100, paginating up to maxPages.
 */
export async function fetchTopStreams(
  maxPages: number = 5,
): Promise<GameStreamData[]> {
  return withRetry(async () => {
    const all: GameStreamData[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, string> = { first: "100" };
      if (cursor) params.after = cursor;

      const res = await helixFetch<PaginatedResponse<TwitchStream>>(
        "/streams",
        params,
      );

      for (const s of res.data) {
        all.push({
          userId: s.user_id,
          userName: s.user_name,
          userLogin: s.user_login,
          viewerCount: s.viewer_count,
          language: s.language,
          startedAt: s.started_at,
          thumbnailUrl: s.thumbnail_url,
        });
      }

      cursor = res.pagination?.cursor;
      if (!cursor || res.data.length === 0) break;
    }

    return all;
  });
}

/**
 * Fetch top clips for a broadcaster.
 * Uses GET /clips?broadcaster_id={id}&first={limit}
 */
export async function fetchClips(
  broadcasterId: string,
  limit: number = 6,
): Promise<ClipData[]> {
  return withRetry(async () => {
    const data = await helixFetch<PaginatedResponse<TwitchClip>>("/clips", {
      broadcaster_id: broadcasterId,
      first: String(Math.min(limit, 25)),
    });

    return data.data.map((clip) => ({
      id: clip.id,
      title: clip.title,
      thumbnailUrl: clip.thumbnail_url,
      viewCount: clip.view_count,
      createdAt: clip.created_at,
      url: clip.url,
      duration: clip.duration,
      language: clip.language || null,
      gameId: clip.game_id || null,
    }));
  });
}

/**
 * Fetch top clips for a game.
 * Uses GET /clips?game_id={id}&first={limit}
 */
export async function fetchClipsByGame(
  twitchGameId: string,
  limit: number = 8,
): Promise<ClipData[]> {
  return withRetry(async () => {
    const data = await helixFetch<PaginatedResponse<TwitchClip>>("/clips", {
      game_id: twitchGameId,
      first: String(Math.min(limit, 25)),
    });

    return data.data.map((clip) => ({
      id: clip.id,
      title: clip.title,
      thumbnailUrl: clip.thumbnail_url,
      viewCount: clip.view_count,
      createdAt: clip.created_at,
      url: clip.url,
      duration: clip.duration,
      language: clip.language || null,
      gameId: clip.game_id || null,
    }));
  });
}

export type VideoData = {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  viewCount: number;
  url: string;
  thumbnailUrl: string;
  language: string | null;
  streamId: string | null;
};

function parseTwitchDuration(duration: string): number {
  let total = 0;
  const h = duration.match(/(\d+)h/);
  const m = duration.match(/(\d+)m/);
  const s = duration.match(/(\d+)s/);
  if (h?.[1]) total += parseInt(h[1], 10) * 3600;
  if (m?.[1]) total += parseInt(m[1], 10) * 60;
  if (s?.[1]) total += parseInt(s[1], 10);
  return total;
}

/**
 * Fetch VODs (archive videos) for a broadcaster.
 * Uses GET /videos?user_id={id}&type=archive
 */
export async function fetchVideos(
  broadcasterId: string,
  options?: { startedAfter?: Date; limit?: number },
): Promise<VideoData[]> {
  const limit = options?.limit ?? 100;
  return withRetry(async () => {
    const all: VideoData[] = [];
    let cursor: string | undefined;
    const maxPages = Math.ceil(limit / 100);

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, string> = {
        user_id: broadcasterId,
        type: "archive",
        first: String(Math.min(limit - all.length, 100)),
      };
      if (cursor) params.after = cursor;

      const res = await helixFetch<PaginatedResponse<TwitchVideo>>(
        "/videos",
        params,
      );

      for (const v of res.data) {
        const createdAt = v.created_at;
        if (
          options?.startedAfter &&
          new Date(createdAt) < options.startedAfter
        ) {
          continue;
        }
        all.push({
          id: v.id,
          title: v.title,
          createdAt,
          durationSeconds: parseTwitchDuration(v.duration),
          viewCount: v.view_count,
          url: v.url,
          thumbnailUrl: v.thumbnail_url,
          language: v.language || null,
          streamId: v.stream_id || null,
        });
      }

      cursor = res.pagination?.cursor;
      if (!cursor || res.data.length === 0 || all.length >= limit) break;
    }

    return all.slice(0, limit);
  });
}

export type GameStreamData = {
  userId: string;
  userName: string;
  userLogin: string;
  viewerCount: number;
  language: string;
  startedAt: string;
  thumbnailUrl: string;
};

export type GameStreamCollection = {
  streams: GameStreamData[];
  truncated: boolean;
};

function resolveBoxArtUrl(boxArtUrl: string | null | undefined): string | null {
  if (!boxArtUrl) return null;
  return boxArtUrl.replace("{width}", "272").replace("{height}", "380");
}

/**
 * Fetch live streams for a game, paginating up to maxPages.
 * Uses GET /streams?game_id={id}&first=100
 */
export async function fetchStreamsByGame(
  twitchGameId: string,
  maxPages: number = 5,
): Promise<GameStreamData[]> {
  const result = await fetchStreamsByGameWithMeta(twitchGameId, maxPages);
  return result.streams;
}

export async function fetchStreamsByGameWithMeta(
  twitchGameId: string,
  maxPages: number = 5,
): Promise<GameStreamCollection> {
  return withRetry(async () => {
    const all: GameStreamData[] = [];
    let cursor: string | undefined;
    let truncated = false;

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, string> = {
        game_id: twitchGameId,
        first: "100",
      };
      if (cursor) params.after = cursor;

      const res = await helixFetch<PaginatedResponse<TwitchStream>>(
        "/streams",
        params,
      );

      for (const s of res.data) {
        all.push({
          userId: s.user_id,
          userName: s.user_name,
          userLogin: s.user_login,
          viewerCount: s.viewer_count,
          language: s.language,
          startedAt: s.started_at,
          thumbnailUrl: s.thumbnail_url,
        });
      }

      cursor = res.pagination?.cursor;
      if (!cursor || res.data.length === 0) break;
      if (page === maxPages - 1) {
        truncated = true;
      }
    }

    return { streams: all, truncated };
  });
}

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
        bio: user.description ?? null,
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

      // Game context: prefer live stream's game, fall back to channel's configured category
      const gameName = stream?.game_name || channel?.game_name || null;
      const gameId = stream?.game_id || channel?.game_id || null;
      const streamTitle = stream?.title || channel?.title || null;
      const streamLanguage = stream?.language || null;
      const streamTags =
        stream?.tags && stream.tags.length > 0
          ? stream.tags.join(",")
          : channel?.tags && channel.tags.length > 0
            ? channel.tags.join(",")
            : null;
      const broadcasterLanguage = channel?.broadcaster_language || null;

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
          AVG_VIEWERS: isLive ? (stream?.viewer_count ?? null) : null,
          // Stream/channel context — persisted so downstream widgets and
          // aggregations (popular games, language filters, etc.) have
          // something to read between snapshots.
          CURRENT_GAME: gameName,
          CURRENT_GAME_ID: gameId,
          STREAM_TITLE: streamTitle,
          STREAM_LANGUAGE: streamLanguage,
          STREAM_TAGS: streamTags,
          BROADCASTER_LANGUAGE: broadcasterLanguage,
          STREAM_STARTED_AT: stream?.started_at || null,
          IS_LIVE: isLive ? 1 : 0,
          // Stash profile metadata so the snapshot worker can refresh
          // the CreatorProfile bio, avatar, displayName, and slug without an extra API call.
          _bio: user.description || null,
          _avatarUrl: user.profile_image_url || null,
          _displayName: user.display_name || null,
          _login: user.login || null,
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

  async fetchTopGamesCatalog(limit: number = 20): Promise<GameCatalogData[]> {
    return withRetry(async () => {
      const all: GameCatalogData[] = [];
      let cursor: string | undefined;

      while (all.length < limit) {
        const batchSize = Math.min(limit - all.length, 100);
        const params: Record<string, string> = {
          first: String(batchSize),
        };
        if (cursor) params.after = cursor;

        const games = await helixFetch<PaginatedResponse<TwitchGame>>(
          "/games/top",
          params,
        );

        all.push(
          ...games.data.map((game) => ({
            platform: "twitch" as Platform,
            platformGameId: game.id,
            gameName: game.name,
            boxArtUrl: resolveBoxArtUrl(game.box_art_url),
            igdbId: game.igdb_id ? parseInt(game.igdb_id, 10) : null,
          })),
        );

        cursor = games.pagination?.cursor;
        if (!cursor || games.data.length === 0) break;
      }

      return all.slice(0, limit);
    });
  },

  async fetchGameLiveStats(
    platformGameId: string,
    options?: { maxPages?: number },
  ): Promise<GameLiveStatsData> {
    return withRetry(async () => {
      const snapshotAt = new Date();
      const { streams, truncated } = await fetchStreamsByGameWithMeta(
        platformGameId,
        options?.maxPages ?? 5,
      );

      return {
        platform: "twitch" as Platform,
        platformGameId,
        snapshotAt,
        viewerCount: streams.reduce(
          (sum, stream) => sum + stream.viewerCount,
          0,
        ),
        channelCount: streams.length,
        streams,
        truncated,
      };
    });
  },

  async fetchTopGames(limit: number = 20): Promise<GameSnapshotData[]> {
    return withRetry(async () => {
      const catalog = await twitchAdapter.fetchTopGamesCatalog!(limit);

      const snapshots: GameSnapshotData[] = [];

      for (const game of catalog) {
        const liveStats = await twitchAdapter.fetchGameLiveStats!(
          game.platformGameId,
        );
        snapshots.push({
          platform: "twitch" as Platform,
          platformGameId: game.platformGameId,
          gameName: game.gameName,
          snapshotAt: liveStats.snapshotAt,
          viewerCount: liveStats.viewerCount,
          channelCount: liveStats.channelCount,
          boxArtUrl: game.boxArtUrl,
        });
      }

      return snapshots;
    });
  },
};
