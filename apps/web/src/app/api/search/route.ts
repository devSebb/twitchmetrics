import { NextResponse } from "next/server";
import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";

type SearchType = "all" | "creators" | "games";

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

const VALID_TYPES: SearchType[] = ["all", "creators", "games"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const type = (searchParams.get("type") ?? "all") as SearchType;

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

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      {
        data: { creators: [], games: [] },
        meta: {},
        error: "Invalid type. Use all, creators, or games",
      },
      { status: 400 },
    );
  }

  const creatorsPromise =
    type === "games"
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

  const gamesPromise =
    type === "creators"
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

  return NextResponse.json(
    serializeBigInt({
      data: {
        creators,
        games,
      },
      meta: {
        query,
        totalResults: creators.length + games.length,
      },
    }),
  );
}
