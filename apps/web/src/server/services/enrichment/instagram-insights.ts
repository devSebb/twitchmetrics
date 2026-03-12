import { EnrichmentRateLimitError, OAuthTokenInvalidError } from "./errors";

type InstagramInsightsResult = {
  impressions: number;
  reach: number;
  profileViews: number;
  websiteClicks: number;
  followerCount: number;
  ageGenderData: Record<string, Record<string, number>> | null;
  countryData: Record<string, number> | null;
};

type InstagramInsightsResponse = {
  data?: Array<{
    name?: string;
    values?: Array<{
      value?: number | string | Record<string, number>;
    }>;
  }>;
  error?: {
    message?: string;
    code?: number;
    type?: string;
  };
};

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseApiError(payload: unknown): { code?: number; message?: string } {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return {};
  }
  const error = payload.error;
  if (!error || typeof error !== "object") {
    return {};
  }

  const result: { code?: number; message?: string } = {};
  if ("code" in error && typeof error.code === "number") {
    result.code = error.code;
  }
  if ("message" in error && typeof error.message === "string") {
    result.message = error.message;
  }
  return result;
}

async function graphFetch<T>(
  path: string,
  params: URLSearchParams,
): Promise<T> {
  const url = `https://graph.instagram.com/${path}?${params.toString()}`;
  const response = await fetch(url);
  const payload = (await response.json()) as unknown;
  const apiError = parseApiError(payload);

  if (response.status === 429) {
    throw new EnrichmentRateLimitError("Instagram rate limit exceeded.");
  }

  if (response.status === 401 || apiError.code === 190) {
    throw new OAuthTokenInvalidError(
      "Instagram OAuth token is invalid or expired.",
    );
  }

  if (response.status === 400) {
    const message = apiError.message ?? "Instagram insights request failed.";
    if (message.toLowerCase().includes("business")) {
      throw new Error(
        "Instagram insights require a Creator or Business account connection.",
      );
    }
    throw new Error(message);
  }

  if (!response.ok) {
    throw new Error(`Instagram insights request failed (${response.status}).`);
  }

  return payload as T;
}

function normalizeCountryData(
  value: Record<string, number>,
): Record<string, number> | null {
  const entries = Object.entries(value);
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, [, count]) => sum + parseNumber(count), 0);
  if (total <= 0) return null;

  const normalized: Record<string, number> = {};
  for (const [country, count] of entries) {
    normalized[country] = parseNumber(count) / total;
  }
  return normalized;
}

function parseAgeGenderData(
  value: Record<string, number>,
): Record<string, Record<string, number>> | null {
  const result: Record<string, Record<string, number>> = {};
  for (const [key, count] of Object.entries(value)) {
    const [genderRaw, ageRaw] = key.split(".");
    if (!genderRaw || !ageRaw) continue;
    const gender =
      genderRaw.toLowerCase() === "m"
        ? "male"
        : genderRaw.toLowerCase() === "f"
          ? "female"
          : "other";

    result[ageRaw] = result[ageRaw] ?? {};
    result[ageRaw][gender] = parseNumber(count);
  }
  return Object.keys(result).length > 0 ? result : null;
}

export async function fetchInstagramInsights(
  accessToken: string,
  igUserId: string,
): Promise<InstagramInsightsResult> {
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceUnix = Math.floor(sinceDate.getTime() / 1000);

  const accountInsightsParams = new URLSearchParams({
    metric: "impressions,reach,profile_views,website_clicks",
    period: "day",
    since: String(sinceUnix),
    access_token: accessToken,
  });
  const accountInsights = await graphFetch<InstagramInsightsResponse>(
    `${igUserId}/insights`,
    accountInsightsParams,
  );

  let impressions = 0;
  let reach = 0;
  let profileViews = 0;
  let websiteClicks = 0;

  for (const metric of accountInsights.data ?? []) {
    const metricName = metric.name ?? "";
    const total = (metric.values ?? []).reduce((sum, item) => {
      return sum + parseNumber(item.value);
    }, 0);
    if (metricName === "impressions") impressions = total;
    if (metricName === "reach") reach = total;
    if (metricName === "profile_views") profileViews = total;
    if (metricName === "website_clicks") websiteClicks = total;
  }

  const demographicsParams = new URLSearchParams({
    metric: "audience_gender_age",
    period: "lifetime",
    access_token: accessToken,
  });
  const demographics = await graphFetch<InstagramInsightsResponse>(
    `${igUserId}/insights`,
    demographicsParams,
  );
  const ageGenderValueRaw = demographics.data?.[0]?.values?.[0]?.value;
  const ageGenderData =
    ageGenderValueRaw &&
    typeof ageGenderValueRaw === "object" &&
    !Array.isArray(ageGenderValueRaw)
      ? parseAgeGenderData(ageGenderValueRaw as Record<string, number>)
      : null;

  const countryParams = new URLSearchParams({
    metric: "audience_country",
    period: "lifetime",
    access_token: accessToken,
  });
  const country = await graphFetch<InstagramInsightsResponse>(
    `${igUserId}/insights`,
    countryParams,
  );
  const countryValueRaw = country.data?.[0]?.values?.[0]?.value;
  const countryData =
    countryValueRaw &&
    typeof countryValueRaw === "object" &&
    !Array.isArray(countryValueRaw)
      ? normalizeCountryData(countryValueRaw as Record<string, number>)
      : null;

  const userResponse = await graphFetch<{ followers_count?: number }>(
    igUserId,
    new URLSearchParams({
      fields: "followers_count",
      access_token: accessToken,
    }),
  );
  const followerCount = parseNumber(userResponse.followers_count);

  return {
    impressions,
    reach,
    profileViews,
    websiteClicks,
    followerCount,
    ageGenderData,
    countryData,
  };
}
