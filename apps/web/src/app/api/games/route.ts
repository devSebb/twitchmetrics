import { NextResponse } from "next/server";
import { buildMeta, parsePagination } from "@/app/api/_lib/pagination";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import {
  getPublicGameListCacheKey,
  normalizeGameListFilters,
} from "@/lib/game-list";
import { listPublicGames } from "@/server/services/public-game-list";

export async function GET(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "games", {
    limit: 120,
    window: "60 s",
  });
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const { page, limit } = parsePagination(searchParams);
  const filters = normalizeGameListFilters({
    page,
    limit,
    query: searchParams.get("q"),
    genre: searchParams.get("genre"),
    sort: searchParams.get("sort"),
    vertical: searchParams.get("vertical"),
  });
  const cacheKey = getPublicGameListCacheKey(filters);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const { games, total } = await listPublicGames(filters);

  const response = serializeBigInt({
    data: games,
    meta: buildMeta(total, filters.page, filters.limit),
  });

  await cacheSet(cacheKey, response, CACHE_TTL.GAME_LIST);
  return NextResponse.json(response);
}
