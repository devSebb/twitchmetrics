import { NextResponse } from "next/server";
import { Platform } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";

const VALID_PLATFORMS = new Set<Platform>([
  "twitch",
  "youtube",
  "instagram",
  "tiktok",
  "x",
  "kick",
]);

const VALID_METRICS = new Set(["followers", "views", "viewers"] as const);
const VALID_PERIODS = new Set(["7d", "30d", "90d", "1y", "all"] as const);

function getPeriodStart(period: string): Date | null {
  const now = Date.now();
  switch (period) {
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now - 90 * 24 * 60 * 60 * 1000);
    case "1y":
      return new Date(now - 365 * 24 * 60 * 60 * 1000);
    case "all":
    default:
      return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const metric = searchParams.get("metric") ?? "followers";
  const period = searchParams.get("period") ?? "30d";

  if (!platform || !VALID_PLATFORMS.has(platform as Platform)) {
    return NextResponse.json(
      {
        data: [],
        meta: {},
        error: "A valid platform query parameter is required",
      },
      { status: 400 },
    );
  }

  if (
    !VALID_METRICS.has(
      metric as typeof VALID_METRICS extends Set<infer T> ? T : never,
    )
  ) {
    return NextResponse.json(
      {
        data: [],
        meta: {},
        error: "Invalid metric. Use followers, views, or viewers",
      },
      { status: 400 },
    );
  }

  if (
    !VALID_PERIODS.has(
      period as typeof VALID_PERIODS extends Set<infer T> ? T : never,
    )
  ) {
    return NextResponse.json(
      {
        data: [],
        meta: {},
        error: "Invalid period. Use 7d, 30d, 90d, 1y, or all",
      },
      { status: 400 },
    );
  }

  const creator = await db.creatorProfile.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!creator) {
    return NextResponse.json(
      {
        data: [],
        meta: {},
        error: "Creator not found",
      },
      { status: 404 },
    );
  }

  const startDate = getPeriodStart(period);

  const snapshots = await db.metricSnapshot.findMany({
    where: {
      creatorProfileId: creator.id,
      platform: platform as Platform,
      ...(startDate ? { snapshotAt: { gte: startDate } } : {}),
    },
    orderBy: { snapshotAt: "asc" },
    select: {
      snapshotAt: true,
      followerCount: true,
      totalViews: true,
    },
  });

  const data = snapshots.map((snapshot) => {
    const value =
      metric === "views" ? snapshot.totalViews : snapshot.followerCount;

    return {
      date: snapshot.snapshotAt.toISOString(),
      value: (value ?? 0n).toString(),
    };
  });

  return NextResponse.json(
    serializeBigInt({
      data,
      meta: {
        period,
        platform,
        metric,
        dataPoints: data.length,
      },
    }),
  );
}
