import type { Platform } from "@twitchmetrics/database";

export type RefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
};

type TokenJson = Record<string, unknown>;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseRefreshResult(
  json: TokenJson,
  fallbackRefreshToken?: string,
): RefreshResult {
  const payload =
    json.data && typeof json.data === "object"
      ? (json.data as TokenJson)
      : json;

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : null;
  if (!accessToken) {
    throw new Error("Token refresh did not return access_token");
  }

  const refreshToken =
    typeof payload.refresh_token === "string"
      ? payload.refresh_token
      : fallbackRefreshToken;

  const expiresInRaw = payload.expires_in;
  const expiresIn =
    typeof expiresInRaw === "number"
      ? expiresInRaw
      : typeof expiresInRaw === "string"
        ? Number.parseInt(expiresInRaw, 10)
        : NaN;

  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : new Date(Date.now() + 3600 * 1000);

  return refreshToken
    ? {
        accessToken,
        refreshToken,
        expiresAt,
      }
    : {
        accessToken,
        expiresAt,
      };
}

export async function refreshTwitchToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientId = getRequiredEnv("TWITCH_CLIENT_ID");
  const clientSecret = getRequiredEnv("TWITCH_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Twitch token");
  }

  return parseRefreshResult((await response.json()) as TokenJson, refreshToken);
}

export async function refreshGoogleToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google token");
  }

  return parseRefreshResult((await response.json()) as TokenJson, refreshToken);
}

export async function refreshTwitterToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientId = getRequiredEnv("TWITTER_CLIENT_ID");
  const clientSecret = getRequiredEnv("TWITTER_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Twitter token");
  }

  return parseRefreshResult((await response.json()) as TokenJson, refreshToken);
}

export async function refreshInstagramToken(
  accessToken: string,
): Promise<RefreshResult> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error("Failed to refresh Instagram token");
  }

  return parseRefreshResult((await response.json()) as TokenJson, accessToken);
}

export async function refreshTikTokToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientKey =
    process.env.TIKTOK_CLIENT_KEY ?? process.env.TIKTOK_CLIENT_ID ?? "";
  const clientSecret = getRequiredEnv("TIKTOK_CLIENT_SECRET");

  if (!clientKey) {
    throw new Error("Missing TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_ID");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_key: clientKey,
    client_secret: clientSecret,
  });

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to refresh TikTok token");
  }

  return parseRefreshResult((await response.json()) as TokenJson, refreshToken);
}

export async function refreshAccessTokenForPlatform(
  platform: Platform,
  decryptedAccessToken: string | null,
  decryptedRefreshToken: string | null,
): Promise<RefreshResult | null> {
  switch (platform) {
    case "twitch":
      return decryptedRefreshToken
        ? refreshTwitchToken(decryptedRefreshToken)
        : null;
    case "youtube":
      return decryptedRefreshToken
        ? refreshGoogleToken(decryptedRefreshToken)
        : null;
    case "x":
      return decryptedRefreshToken
        ? refreshTwitterToken(decryptedRefreshToken)
        : null;
    case "instagram":
      return decryptedAccessToken
        ? refreshInstagramToken(decryptedAccessToken)
        : null;
    case "tiktok":
      return decryptedRefreshToken
        ? refreshTikTokToken(decryptedRefreshToken)
        : null;
    case "kick":
      return null;
  }
}
