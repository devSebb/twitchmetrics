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

  const topChannels = await db.gameTopChannel.findMany({
    where: { gameId: game.id },
    orderBy: { viewerHours: "desc" },
    take: 10,
  });

  const serialized = serializeBigInt({
    ...game,
    latestSnapshot: game.viewerSnapshots[0] ?? null,
    topChannels,
  });

  await cacheSet(cacheKey, serialized, CACHE_TTL.GAME_PROFILE);
  return NextResponse.json({ data: serialized, meta: {} });
}
