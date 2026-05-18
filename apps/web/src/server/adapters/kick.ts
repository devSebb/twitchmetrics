import type { Platform } from "@twitchmetrics/database";
import {
  AdapterError,
  type CreatorProfileData,
  type CreatorSnapshotData,
  type PlatformAdapter,
  type SearchResult,
} from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("kick-adapter");

const KICK_API_BASE = "https://api.kick.com";
const KICK_OAUTH_BASE = "https://id.kick.com";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

type KickTokenResponse = {
  access_token?: string;
  expires_in?: number | string;
  token_type?: string;
};

export type KickCategory = {
  id?: number;
  name?: string;
  thumbnail?: string | null;
  tags?: string[];
  viewer_count?: number | null;
};

type KickStream = {
  custom_tags?: string[];
  is_live?: boolean;
  is_mature?: boolean;
  language?: string | null;
  start_time?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  viewer_count?: number | null;
};

export type KickChannel = {
  active_subscribers_count?: number | null;
  banner_picture?: string | null;
  broadcaster_user_id?: number | string;
  canceled_subscribers_count?: number | null;
  category?: KickCategory | null;
  channel_description?: string | null;
  profile_picture?: string | null;
  slug?: string;
  stream?: KickStream | null;
  stream_title?: string | null;
};

type KickChannelsResponse = {
  data?: KickChannel[];
  message?: string;
};

type KickCategoriesResponse =
  | {
      data?:
        | KickCategory[]
        | {
            categories?: KickCategory[];
            cursor?: string | null;
          };
      pagination?: {
        next_cursor?: string | null;
      };
      message?: string;
    }
  | {
      categories?: KickCategory[];
      cursor?: string | null;
      pagination?: {
        next_cursor?: string | null;
      };
      message?: string;
    };

type SnapshotExtendedMetrics = CreatorSnapshotData["extendedMetrics"] &
  Record<string, number | bigint | string | null>;

let cachedAppToken: { token: string; expiresAt: number } | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AdapterError("kick", "api_error", `Missing ${name}`);
  }
  return value;
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function channelDisplayName(channel: KickChannel): string {
  return channel.slug ?? String(channel.broadcaster_user_id ?? "unknown");
}

function channelSlug(channel: KickChannel): string {
  return channel.slug ?? String(channel.broadcaster_user_id ?? "");
}

function channelUrl(channel: KickChannel): string | null {
  const slug = channel.slug;
  return slug ? `https://kick.com/${slug}` : null;
}

function appTokenStillValid(): boolean {
  return Boolean(
    cachedAppToken &&
    Date.now() < cachedAppToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS,
  );
}

async function getKickAppToken(): Promise<string> {
  if (appTokenStillValid()) {
    return cachedAppToken!.token;
  }

  const clientId = getRequiredEnv("KICK_CLIENT_ID");
  const clientSecret = getRequiredEnv("KICK_CLIENT_SECRET");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new AdapterError(
      "kick",
      response.status === 429 ? "rate_limited" : "api_error",
      `KICK token request failed: ${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  }

  const json = (await response.json()) as KickTokenResponse;
  if (!json.access_token) {
    throw new AdapterError(
      "kick",
      "api_error",
      "KICK token missing access_token",
    );
  }

  const expiresIn =
    typeof json.expires_in === "number"
      ? json.expires_in
      : typeof json.expires_in === "string"
        ? Number.parseInt(json.expires_in, 10)
        : 3600;

  cachedAppToken = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(expiresIn, 60) * 1000,
  };

  return cachedAppToken.token;
}

async function kickApiFetch<T>(
  path: string,
  params: Record<string, string | string[]> = {},
): Promise<T> {
  const token = await getKickAppToken();
  const url = new URL(`${KICK_API_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (response.status === 401 || response.status === 403) {
    cachedAppToken = null;
    throw new AdapterError(
      "kick",
      "auth_expired",
      `KICK API authorization failed: ${response.status}`,
      response.status === 401,
    );
  }

  if (response.status === 404) {
    throw new AdapterError("kick", "not_found", "KICK resource not found");
  }

  if (response.status === 429) {
    throw new AdapterError(
      "kick",
      "rate_limited",
      "KICK API rate limited",
      true,
    );
  }

  if (!response.ok) {
    throw new AdapterError(
      "kick",
      "api_error",
      `KICK API error: ${response.status}`,
      response.status >= 500,
    );
  }

  return response.json() as Promise<T>;
}

export async function fetchKickChannelsByUserIds(
  broadcasterUserIds: string[],
): Promise<KickChannel[]> {
  if (broadcasterUserIds.length === 0) return [];
  const response = await kickApiFetch<KickChannelsResponse>(
    "/public/v1/channels",
    {
      broadcaster_user_id: broadcasterUserIds.slice(0, 50),
    },
  );
  return response.data ?? [];
}

export async function fetchKickChannelsBySlugs(
  slugs: string[],
): Promise<KickChannel[]> {
  if (slugs.length === 0) return [];
  const response = await kickApiFetch<KickChannelsResponse>(
    "/public/v1/channels",
    {
      slug: slugs.slice(0, 50),
    },
  );
  return response.data ?? [];
}

export async function fetchKickCategories(
  input: {
    limit?: number;
    cursor?: string | null;
    search?: string;
  } = {},
): Promise<{ categories: KickCategory[]; cursor: string | null }> {
  const params: Record<string, string> = {
    limit: String(Math.min(Math.max(input.limit ?? 100, 1), 100)),
  };
  if (input.cursor) params.cursor = input.cursor;
  if (input.search) params.search = input.search;

  const response = await kickApiFetch<KickCategoriesResponse>(
    "/public/v2/categories",
    params,
  );

  if ("categories" in response) {
    return {
      categories: response.categories ?? [],
      cursor: response.cursor ?? response.pagination?.next_cursor ?? null,
    };
  }

  const data = "data" in response ? response.data : undefined;
  const categories = Array.isArray(data) ? data : (data?.categories ?? []);
  const dataCursor = Array.isArray(data) ? null : (data?.cursor ?? null);

  return {
    categories,
    cursor:
      dataCursor ??
      ("pagination" in response ? response.pagination?.next_cursor : null) ??
      null,
  };
}

export function kickChannelToSnapshot(
  channel: KickChannel,
  fallbackPlatformUserId?: string,
): CreatorSnapshotData {
  const stream = channel.stream ?? null;
  const isLive = stream?.is_live === true;
  const viewerCount =
    typeof stream?.viewer_count === "number" ? stream.viewer_count : null;
  const categoryId =
    channel.category?.id !== undefined ? String(channel.category.id) : null;
  const tags =
    stream?.custom_tags && stream.custom_tags.length > 0
      ? stream.custom_tags.join(",")
      : null;

  const extendedMetrics: SnapshotExtendedMetrics = {
    AVG_VIEWERS: isLive ? viewerCount : null,
    LIVE_VIEWER_COUNT: isLive ? viewerCount : null,
    PEAK_VIEWERS: isLive ? viewerCount : null,
    CURRENT_GAME: channel.category?.name ?? null,
    CURRENT_GAME_ID: categoryId,
    STREAM_TITLE: channel.stream_title ?? null,
    STREAM_LANGUAGE: stream?.language ?? null,
    STREAM_TAGS: tags,
    STREAM_STARTED_AT: stream?.start_time ?? null,
    STREAM_THUMBNAIL_URL: stream?.thumbnail ?? null,
    IS_LIVE: isLive ? 1 : 0,
    ACTIVE_SUBSCRIBERS: channel.active_subscribers_count ?? null,
    CANCELED_SUBSCRIBERS: channel.canceled_subscribers_count ?? null,
    _bio: channel.channel_description ?? null,
    _avatarUrl: channel.profile_picture ?? null,
    _bannerUrl: channel.banner_picture ?? null,
    _displayName: channelDisplayName(channel),
    _login: channelSlug(channel),
  };

  return {
    platform: "kick" as Platform,
    platformUserId: String(
      channel.broadcaster_user_id ??
        fallbackPlatformUserId ??
        channel.slug ??
        "",
    ),
    snapshotAt: new Date(),
    followerCount: null,
    followingCount: null,
    totalViews: null,
    subscriberCount: null,
    postCount: null,
    extendedMetrics,
  };
}

export const kickAdapter: PlatformAdapter = {
  platform: "kick" as Platform,

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    const channels = isNumericId(platformUsername)
      ? await fetchKickChannelsByUserIds([platformUsername])
      : await fetchKickChannelsBySlugs([platformUsername]);
    const channel = channels[0];

    if (!channel) {
      throw new AdapterError(
        "kick",
        "not_found",
        `KICK channel '${platformUsername}' not found`,
      );
    }

    return {
      platform: "kick" as Platform,
      platformUserId: String(channel.broadcaster_user_id ?? platformUsername),
      platformUsername: channelSlug(channel),
      platformDisplayName: channelDisplayName(channel),
      platformUrl: channelUrl(channel),
      platformAvatarUrl: channel.profile_picture ?? null,
      followerCount: null,
      followingCount: null,
      totalViews: null,
      postCount: null,
      bio: channel.channel_description ?? null,
      isLive: channel.stream?.is_live ?? null,
      rawResponse: channel,
    };
  },

  async fetchSnapshot(platformUserId: string): Promise<CreatorSnapshotData> {
    const channels = isNumericId(platformUserId)
      ? await fetchKickChannelsByUserIds([platformUserId])
      : await fetchKickChannelsBySlugs([platformUserId]);
    const channel = channels[0];

    if (!channel) {
      throw new AdapterError(
        "kick",
        "not_found",
        `KICK channel '${platformUserId}' not found`,
      );
    }

    return kickChannelToSnapshot(channel, platformUserId);
  },

  async search(query: string, _limit = 10): Promise<SearchResult[]> {
    try {
      const profile = await this.fetchProfile(query);
      return [
        {
          platform: "kick" as Platform,
          platformUserId: profile.platformUserId,
          platformUsername: profile.platformUsername,
          platformDisplayName: profile.platformDisplayName,
          platformAvatarUrl: profile.platformAvatarUrl,
          followerCount: null,
          isLive: profile.isLive,
        },
      ];
    } catch (error) {
      if (error instanceof AdapterError && error.code === "not_found") {
        return [];
      }
      log.warn({ err: error, query }, "KICK search failed");
      throw error;
    }
  },
};
