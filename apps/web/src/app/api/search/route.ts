import { NextResponse } from "next/server";
import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import { getSearchScopes, normalizeSearchType } from "@/lib/search";

type CreatorSearchRow = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: bigint;
  relevance: number;
};

type GameSearchRow = {
  id: string;
  name: string;
  slug: string;
  coverImageUrl: string | null;
  currentViewers: number;
  relevance: number;
};

export async function GET(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "search", {
    limit: 60,
    window: "60 s",
  });
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const requestedType = searchParams.get("type");
  const type = normalizeSearchType(requestedType);

  if (!query) {
    return NextResponse.json(
      {
        data: { creators: [], games: [] },
        meta: {},
        error: "Search query 'q' is required",
      },
      { status: 400 },
    );
  }

  if (requestedType !== null && requestedType !== type) {
    return NextResponse.json(
      {
        data: { creators: [], games: [] },
        meta: {},
        error: "Invalid type. Use all, creators, or games",
      },
      { status: 400 },
    );
  }

  const scopes = getSearchScopes(type);

  const cacheKey = `search:${type}:${query.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const creatorsPromise = !scopes.creators
    ? Promise.resolve<CreatorSearchRow[]>([])
    : db.$queryRaw<CreatorSearchRow[]>(Prisma.sql`
          SELECT
            cp.id,
            cp."displayName",
            cp.slug,
            cp."avatarUrl",
            cp."totalFollowers",
            similarity(cp."searchText", ${query}) AS relevance
          FROM "CreatorProfile" cp
          WHERE cp."searchText" % ${query}
             OR cp."searchText" ILIKE '%' || ${query} || '%'
          ORDER BY relevance DESC, cp."totalFollowers" DESC
          LIMIT 10
        `);

  const gamesPromise = !scopes.games
    ? Promise.resolve<GameSearchRow[]>([])
    : db.$queryRaw<GameSearchRow[]>(Prisma.sql`
          SELECT
            g.id,
            g.name,
            g.slug,
            g."coverImageUrl",
            g."currentViewers",
            similarity(g."searchText", ${query}) AS relevance
          FROM "Game" g
          WHERE g."searchText" % ${query}
             OR g."searchText" ILIKE '%' || ${query} || '%'
          ORDER BY relevance DESC, g."currentViewers" DESC
          LIMIT 10
        `);

  const [creators, games] = await Promise.all([creatorsPromise, gamesPromise]);

  // Fallback: if no DB creator matches and the user was looking for creators,
  // surface live Twitch results so the UI can show "not tracked yet" suggestions.
  type UntrackedCreator = {
    platformUserId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isLive: boolean | null;
  };
  let untrackedCreators: UntrackedCreator[] = [];
  if (scopes.creators && creators.length === 0 && query.length >= 2) {
    try {
      const { twitchAdapter } = await import("@/server/adapters/twitch");
      const results = await twitchAdapter.search(query, 5);
      untrackedCreators = results.map((r) => ({
        platformUserId: r.platformUserId,
        username: r.platformUsername,
        displayName: r.platformDisplayName,
        avatarUrl: r.platformAvatarUrl,
        isLive: r.isLive,
      }));
    } catch {
      // Non-blocking — untracked fallback is a nice-to-have
    }
  }

  const response = serializeBigInt({
    data: {
      creators,
      games,
      untrackedCreators,
    },
    meta: {
      query,
      totalResults: creators.length + games.length,
    },
  });

  await cacheSet(cacheKey, response, CACHE_TTL.SEARCH_RESULTS);
  return NextResponse.json(response);
}
