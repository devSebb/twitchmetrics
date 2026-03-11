import { NextResponse } from "next/server";
import { db } from "@/server/db";

const VALID_METRICS = ["viewers", "channels"] as const;
const VALID_PERIODS = ["24h", "7d", "30d"] as const;

function getPeriodStart(period: string): Date {
  const now = Date.now();
  switch (period) {
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "24h":
    default:
      return new Date(now - 24 * 60 * 60 * 1000);
  }
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
        error: "Invalid metric. Use viewers or channels",
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

  const startDate = getPeriodStart(period);
  const snapshots = await db.gameViewerSnapshot.findMany({
    where: {
      gameId: game.id,
      snapshotAt: { gte: startDate },
    },
    orderBy: { snapshotAt: "asc" },
    select: {
      snapshotAt: true,
      totalViewers: true,
      totalChannels: true,
    },
  });

  const data = snapshots.map((snapshot) => ({
    date: snapshot.snapshotAt.toISOString(),
    value:
      metric === "channels" ? snapshot.totalChannels : snapshot.totalViewers,
  }));

  return NextResponse.json({
    data,
    meta: {
      period,
      metric,
      dataPoints: data.length,
    },
  });
}
