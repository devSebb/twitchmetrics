import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const cacheKey = `game:${slug}`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, meta: {} });
  }

  const game = await db.game.findUnique({
    where: { slug },
    include: {
      viewerSnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 1,
      },
    },
  });

  if (!game) {
    return NextResponse.json(
      {
        data: null,
        meta: {},
        error: "Game not found",
      },
      { status: 404 },
    );
  }

  // Seed data does not currently store a direct game<->creator relationship.
  // We approximate "top creators for this game" by overall top creators.
  const topCreators = await db.creatorProfile.findMany({
    orderBy: { totalFollowers: "desc" },
    take: 10,
    select: {
      id: true,
      displayName: true,
      slug: true,
      avatarUrl: true,
      totalFollowers: true,
      primaryPlatform: true,
    },
  });

  const serialized = serializeBigInt({
    ...game,
    latestSnapshot: game.viewerSnapshots[0] ?? null,
    topCreators,
  });

  await cacheSet(cacheKey, serialized, CACHE_TTL.GAME_PROFILE);
  return NextResponse.json({ data: serialized, meta: {} });
}
