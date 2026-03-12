import { EnrichmentRateLimitError, OAuthTokenInvalidError } from "./errors";

type YouTubeAnalyticsResult = {
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  subscribersGained: number;
  subscribersLost: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  estimatedRevenue: number | null;
  ageGenderData: Record<string, Record<string, number>> | null;
  countryData: Record<string, number> | null;
  deviceData: Record<string, number> | null;
  trafficSources: Record<string, number> | null;
};

type ReportsResponse = {
  columnHeaders?: Array<{ name?: string }>;
  rows?: Array<Array<string | number>>;
};

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeSharesMetric(value: string): string {
  return value === "annotationClickThroughRate" ? "shares" : value;
}

function normalizeDistribution(
  rows: Array<Array<string | number>> | undefined,
): Record<string, number> | null {
  if (!rows || rows.length === 0) return null;
  const totals = rows.reduce((sum, row) => sum + parseNumber(row[1]), 0);
  if (totals <= 0) return null;

  const normalized: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[0] ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    normalized[key] = parseNumber(row[1]) / totals;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

async function youtubeAnalyticsFetch(
  accessToken: string,
  params: URLSearchParams,
): Promise<ReportsResponse> {
  const response = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new OAuthTokenInvalidError(
      "YouTube OAuth token is invalid or missing analytics permissions.",
    );
  }
  if (response.status === 429) {
    throw new EnrichmentRateLimitError(
      "YouTube analytics rate limit exceeded.",
    );
  }
  if (!response.ok) {
    throw new Error(`YouTube analytics request failed (${response.status}).`);
  }

  return (await response.json()) as ReportsResponse;
}

export async function fetchYouTubeAnalytics(
  accessToken: string,
  channelId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<YouTubeAnalyticsResult> {
  if (!channelId.trim()) {
    throw new Error("Missing YouTube channel identifier for enrichment.");
  }

  const baseParams = new URLSearchParams({
    ids: "channel==MINE",
    startDate: toDateString(periodStart),
    endDate: toDateString(periodEnd),
  });

  const metricsParams = new URLSearchParams(baseParams);
  metricsParams.set(
    "metrics",
    [
      "estimatedMinutesWatched",
      "averageViewDuration",
      "subscribersGained",
      "subscribersLost",
      "views",
      "likes",
      "comments",
      "shares",
    ].join(","),
  );

  const baseMetrics = await youtubeAnalyticsFetch(accessToken, metricsParams);
  const metricHeaders = (baseMetrics.columnHeaders ?? []).map((header) =>
    normalizeSharesMetric(String(header.name ?? "")),
  );
  const metricRow = baseMetrics.rows?.[0] ?? [];
  const metricMap = new Map<string, number>();
  metricHeaders.forEach((name, index) => {
    metricMap.set(name, parseNumber(metricRow[index]));
  });

  let estimatedRevenue: number | null = null;
  {
    const revenueParams = new URLSearchParams(baseParams);
    revenueParams.set("metrics", "estimatedRevenue");
    const response = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${revenueParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (response.status === 401) {
      throw new OAuthTokenInvalidError(
        "YouTube OAuth token is invalid or expired for revenue metric.",
      );
    }
    if (response.status === 429) {
      throw new EnrichmentRateLimitError(
        "YouTube analytics rate limit exceeded.",
      );
    }
    if (response.status !== 403 && response.ok) {
      const revenueResponse = (await response.json()) as ReportsResponse;
      estimatedRevenue = parseNumber(revenueResponse.rows?.[0]?.[0]);
    }
  }

  const demographicsParams = new URLSearchParams(baseParams);
  demographicsParams.set("dimensions", "ageGroup,gender");
  demographicsParams.set("metrics", "viewerPercentage");
  const demographicsResponse = await youtubeAnalyticsFetch(
    accessToken,
    demographicsParams,
  );
  const ageGenderData: Record<string, Record<string, number>> = {};
  for (const row of demographicsResponse.rows ?? []) {
    const ageGroupRaw = String(row[0] ?? "").replace(/^age/i, "");
    const genderRaw = String(row[1] ?? "").toLowerCase();
    const percentage = parseNumber(row[2]) / 100;
    if (!ageGroupRaw || !genderRaw || percentage <= 0) continue;
    ageGenderData[ageGroupRaw] = ageGenderData[ageGroupRaw] ?? {};
    ageGenderData[ageGroupRaw][genderRaw] = percentage;
  }

  const countryParams = new URLSearchParams(baseParams);
  countryParams.set("dimensions", "country");
  countryParams.set("metrics", "views");
  const countryResponse = await youtubeAnalyticsFetch(
    accessToken,
    countryParams,
  );

  const deviceParams = new URLSearchParams(baseParams);
  deviceParams.set("dimensions", "deviceType");
  deviceParams.set("metrics", "views");
  const deviceResponse = await youtubeAnalyticsFetch(accessToken, deviceParams);

  const trafficParams = new URLSearchParams(baseParams);
  trafficParams.set("dimensions", "insightTrafficSourceType");
  trafficParams.set("metrics", "views");
  const trafficResponse = await youtubeAnalyticsFetch(
    accessToken,
    trafficParams,
  );

  return {
    estimatedMinutesWatched: metricMap.get("estimatedMinutesWatched") ?? 0,
    averageViewDuration: metricMap.get("averageViewDuration") ?? 0,
    subscribersGained: metricMap.get("subscribersGained") ?? 0,
    subscribersLost: metricMap.get("subscribersLost") ?? 0,
    views: metricMap.get("views") ?? 0,
    likes: metricMap.get("likes") ?? 0,
    comments: metricMap.get("comments") ?? 0,
    shares: metricMap.get("shares") ?? 0,
    estimatedRevenue,
    ageGenderData: Object.keys(ageGenderData).length > 0 ? ageGenderData : null,
    countryData: normalizeDistribution(countryResponse.rows),
    deviceData: normalizeDistribution(deviceResponse.rows),
    trafficSources: normalizeDistribution(trafficResponse.rows),
  };
}
