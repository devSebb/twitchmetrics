import { EnrichmentRateLimitError, OAuthTokenInvalidError } from "./errors";

type TwitchAuthenticatedResult = {
  subscriberCount: number;
  subscriberPoints: number;
};

type TwitchSubscriptionsResponse = {
  total?: number;
  points?: number;
};

export async function fetchTwitchSubscriberData(
  accessToken: string,
  broadcasterId: string,
): Promise<TwitchAuthenticatedResult> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    throw new Error("Missing TWITCH_CLIENT_ID for Twitch enrichment.");
  }

  const url = new URL("https://api.twitch.tv/helix/subscriptions");
  url.searchParams.set("broadcaster_id", broadcasterId);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new OAuthTokenInvalidError(
      "Twitch OAuth token is invalid or missing channel:read:subscriptions scope.",
    );
  }
  if (response.status === 429) {
    throw new EnrichmentRateLimitError("Twitch API rate limit exceeded.");
  }
  if (!response.ok) {
    throw new Error(`Twitch subscriber request failed (${response.status}).`);
  }

  const payload = (await response.json()) as TwitchSubscriptionsResponse;
  return {
    subscriberCount: payload.total ?? 0,
    subscriberPoints: payload.points ?? 0,
  };
}
