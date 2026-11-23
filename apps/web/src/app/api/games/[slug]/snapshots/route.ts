import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import { loadGameSeries } from "@/server/services/game-series-load";
import { summarizeGameSeries } from "@/server/services/game-viewer-series";

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

/**
 * A game's viewers and live channels per platform for one period: the series
 * both game-page charts draw, with the same summary arithmetic as the header.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "7d";

  if (!VALID_PERIODS.includes(period as (typeof VALID_PERIODS)[number])) {
    return NextResponse.json(
      { data: null, meta: {}, error: "Invalid period. Use 24h, 7d, or 30d" },
      { status: 400 },
    );
  }

  const { until, fixed } = parseUntil(searchParams.get("until"));
  const periodMs = PERIOD_MS[period as (typeof VALID_PERIODS)[number]];
  // A page-supplied end is fixed, so it is part of the key; "now" is not.
  const cacheKey = `game:${slug}:series2:${period}:${fixed ? until.toISOString() : "latest"}`;
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
      { data: null, meta: {}, error: "Game not found" },
      { status: 404 },
    );
  }

  const series = await loadGameSeries(db, {
    gameId: game.id,
    since: new Date(until.getTime() - periodMs),
    until,
  });

  const response = {
    data: series,
    meta: {
      period,
      until: until.toISOString(),
      summary: summarizeGameSeries(series),
    },
  };

  await cacheSet(cacheKey, response, CACHE_TTL.GAME_SNAPSHOTS);
  return NextResponse.json(response);
}
