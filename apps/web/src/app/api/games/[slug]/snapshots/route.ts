import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import { summarizeViewerSeries } from "@/server/services/game-metrics";

const VALID_METRICS = ["viewers", "channels", "all"] as const;
const VALID_PERIODS = ["24h", "7d", "30d"] as const;

const PERIOD_MS: Record<(typeof VALID_PERIODS)[number], number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/**
 * End of the window. The game page passes the snapshot its header was built
 * from, so the chart covers exactly the header's window even when the page is
 * cached and newer snapshots exist (QA: 24h chart peak 128.7k vs header
 * 121.8k). Missing, invalid or future values fall back to now.
 */
function parseUntil(value: string | null): { until: Date; fixed: boolean } {
  const now = new Date();
  const until = value ? new Date(value) : null;
  return until && Number.isFinite(until.getTime()) && until < now
    ? { until, fixed: true }
    : { until: now, fixed: false };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "viewers";
  const period = searchParams.get("period") ?? "24h";

  if (!VALID_METRICS.includes(metric as (typeof VALID_METRICS)[number])) {
    return NextResponse.json(
      {
        data: [],
        meta: {},
        error: "Invalid metric. Use viewers, channels, or all",
      },
      { status: 400 },
    );
  }

  if (!VALID_PERIODS.includes(period as (typeof VALID_PERIODS)[number])) {
    return NextResponse.json(
      {
        data: [],
        meta: {},
        error: "Invalid period. Use 24h, 7d, or 30d",
      },
      { status: 400 },
    );
  }

  const { until, fixed } = parseUntil(searchParams.get("until"));
  const periodMs = PERIOD_MS[period as (typeof VALID_PERIODS)[number]];
  // A page-supplied end is fixed, so it is part of the key; "now" is not.
  const cacheKey = `game:${slug}:snapshots:${metric}:${period}:${fixed ? until.toISOString() : "latest"}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const game = await db.game.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!game) {
    return NextResponse.json(
      {
        data: [],
        meta: {},
        error: "Game not found",
      },
      { status: 404 },
    );
  }

  const snapshots = await db.gameViewerSnapshot.findMany({
    where: {
      gameId: game.id,
      snapshotAt: {
        gte: new Date(until.getTime() - periodMs),
        lte: until,
      },
    },
    orderBy: { snapshotAt: "asc" },
    select: {
      snapshotAt: true,
      totalViewers: true,
      totalChannels: true,
    },
  });

  const data =
    metric === "all"
      ? snapshots.map((snapshot) => ({
          date: snapshot.snapshotAt.toISOString(),
          viewers: snapshot.totalViewers,
          channels: snapshot.totalChannels,
        }))
      : snapshots.map((snapshot) => ({
          date: snapshot.snapshotAt.toISOString(),
          value:
            metric === "channels"
              ? snapshot.totalChannels
              : snapshot.totalViewers,
        }));

  const response = {
    data,
    meta: {
      period,
      metric,
      dataPoints: data.length,
      until: until.toISOString(),
      // Same arithmetic as the header's 7d average and 24h peak.
      viewers: summarizeViewerSeries(snapshots),
    },
  };

  await cacheSet(cacheKey, response, CACHE_TTL.GAME_SNAPSHOTS);
  return NextResponse.json(response);
}
