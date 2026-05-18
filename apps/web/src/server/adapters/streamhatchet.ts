import type { Platform } from "@twitchmetrics/database";

const STREAMHATCHET_BASE_URL = "https://api.streamhatchet.com";

export type StreamHatchetPlatform =
  | "twitch"
  | "ytg"
  | "kick"
  | "afreeca"
  | "tiktok"
  | "chzzk"
  | "facebook"
  | "steam"
  | "trovo"
  | "openrec"
  | "bigo"
  | "rooter"
  | "kakao";

export type StreamHatchetInternalPlatform = Extract<
  Platform,
  "twitch" | "youtube" | "kick"
>;

export type StreamHatchetPlatformAggregate = {
  platform: StreamHatchetPlatform | string;
  viewers?: number | null;
  current_viewers?: number | null;
  channels?: number | null;
  live_channels?: number | null;
  hours_watched?: number | null;
  airtime_hours?: number | null;
  peak_viewers?: number | null;
  peak_channels?: number | null;
  unique_channels?: number | null;
  average_viewers?: number | null;
  average_channels?: number | null;
  max_rank?: number | null;
  avg_rank?: number | null;
  min_rank?: number | null;
};

export type StreamHatchetGameAggregate = {
  hours_watched?: number | null;
  airtime_hours?: number | null;
  peak_viewers?: number | null;
  peak_channels?: number | null;
  unique_channels?: number | null;
  average_viewers?: number | null;
  average_channels?: number | null;
  game: string;
  game_id: number | string;
  platform_data?: StreamHatchetPlatformAggregate[];
  metadata?: {
    giantbomb_id?: string | null;
    giantbomb_name?: string | null;
    release_date?: string | null;
    names?: string[];
    genre?: string[];
    publisher?: string[];
    developer?: string[];
    platform?: string[];
    similar_games?: string[];
    franchise?: string[];
  } | null;
};

export type StreamHatchetLiveChannel = {
  user_id: string | number;
  username: string;
  display_name?: string | null;
  current_viewers?: number | null;
  game?: string | null;
  title?: string | null;
  followers?: number | null;
  views?: number | null;
  peak_views?: number | null;
  language?: string | null;
  country?: string | null;
  timestamp?: number | null;
  platform: StreamHatchetPlatform | string;
  started_at?: number | null;
  logo?: string | null;
  started_at_date?: string | null;
  video?: string | null;
  category_id?: string | number | null;
};

export type StreamHatchetLiveGame = {
  game?: string | null;
  game_id?: string | number | null;
  viewers?: number | null;
  current_viewers?: number | null;
  channels?: number | null;
  live_channels?: number | null;
  platform?: StreamHatchetPlatform | string | null;
  platform_data?: StreamHatchetPlatformAggregate[];
  [key: string]: unknown;
};

export class StreamHatchetError extends Error {
  readonly code: "missing_token" | "rate_limited" | "api_error" | "timeout";
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: StreamHatchetError["code"],
    message: string,
    options: {
      status?: number | undefined;
      retryAfterSeconds?: number | undefined;
    } = {},
  ) {
    super(message);
    this.name = "StreamHatchetError";
    this.code = code;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function internalPlatformForStreamHatchet(
  platform: string | null | undefined,
): StreamHatchetInternalPlatform | null {
  switch (platform) {
    case "twitch":
      return "twitch";
    case "ytg":
      return "youtube";
    case "kick":
      return "kick";
    default:
      return null;
  }
}

function token(): string {
  const value = process.env.STREAMHATCHET_API_KEY;
  if (!value) {
    throw new StreamHatchetError(
      "missing_token",
      "STREAMHATCHET_API_KEY is not configured",
    );
  }
  return value;
}

function url(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const next = new URL(path, STREAMHATCHET_BASE_URL);
  next.searchParams.set("token", token());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) next.searchParams.set(key, String(value));
  }
  return next;
}

function retryAfter(response: Response): number | undefined {
  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds)) return retryAfterSeconds;
  }

  const resetHeader = response.headers.get("x-ratelimit-reset");
  if (!resetHeader) return undefined;

  const resetAt = Number(resetHeader);
  if (!Number.isFinite(resetAt)) return undefined;

  return Math.max(0, resetAt - Math.floor(Date.now() / 1000));
}

async function streamHatchetFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url(path, params), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new StreamHatchetError(
        "timeout",
        "StreamHatchet request timed out",
      );
    }
    throw error;
  }

  if (response.status === 429) {
    throw new StreamHatchetError("rate_limited", "StreamHatchet rate limited", {
      status: response.status,
      retryAfterSeconds: retryAfter(response),
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new StreamHatchetError(
      "api_error",
      `StreamHatchet API error ${response.status}: ${body.slice(0, 300)}`,
      { status: response.status },
    );
  }

  return (await response.json()) as T;
}

export async function fetchStreamHatchetGameDiscovery(input: {
  platforms: StreamHatchetPlatform[];
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  sortBy?:
    | "game"
    | "hours_watched"
    | "unique_channels"
    | "average_viewers"
    | "average_channels"
    | "peak_viewers"
    | "peak_channels"
    | "airtime_hours"
    | "release_date"
    | "max_rank"
    | "avg_rank"
    | "min_rank";
  excludedGenres?: string;
}): Promise<StreamHatchetGameAggregate[]> {
  const response = await streamHatchetFetch<{
    games?: StreamHatchetGameAggregate[];
    global_aggregates?: StreamHatchetGameAggregate[];
  }>("/discovery/games/last_30_days", {
    platforms: input.platforms.join(","),
    limit: input.limit ?? 25,
    offset: input.offset ?? 0,
    order: input.order ?? "desc",
    sort_by: input.sortBy ?? "hours_watched",
    excluded_genres: input.excludedGenres,
  });

  return response.games ?? response.global_aggregates ?? [];
}

export async function fetchStreamHatchetLiveChannels(input: {
  game: string;
  platforms: StreamHatchetPlatform[];
  limit?: number;
  offset?: number;
}): Promise<StreamHatchetLiveChannel[]> {
  const response = await streamHatchetFetch<{
    data?: StreamHatchetLiveChannel[];
  }>("/live", {
    game: input.game,
    platforms: input.platforms.join(","),
    limit: input.limit ?? 25,
    offset: input.offset ?? 0,
  });

  return response.data ?? [];
}

export async function fetchStreamHatchetLiveGames(input: {
  platforms: StreamHatchetPlatform[];
  sortBy?: "viewers" | "channels";
}): Promise<StreamHatchetLiveGame[]> {
  const response = await streamHatchetFetch<{
    data?: StreamHatchetLiveGame[];
    games?: StreamHatchetLiveGame[];
  }>("/live/games", {
    platforms: input.platforms.join(","),
    sort_by: input.sortBy,
  });

  return response.data ?? response.games ?? [];
}
