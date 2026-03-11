import { NextResponse } from "next/server";
import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { buildMeta, parsePagination } from "@/app/api/_lib/pagination";
import { serializeBigInt } from "@/app/api/_lib/serialize";

type GameIdRow = { id: string };
type TotalRow = { total: bigint };

function buildWhereClause(genre: string | null, query: string | null) {
  const conditions: Prisma.Sql[] = [];

  if (genre) {
    conditions.push(Prisma.sql`g.genres @> ARRAY[${genre}]::text[]`);
  }

  if (query) {
    conditions.push(
      Prisma.sql`(g."searchText" % ${query} OR g."searchText" ILIKE '%' || ${query} || '%')`,
    );
  }

  if (!conditions.length) {
    return Prisma.sql``;
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function getOrderClause(sort: string | null): Prisma.Sql {
  switch (sort) {
    case "channels":
      return Prisma.sql`ORDER BY g."currentChannels" DESC`;
    case "hoursWatched":
      return Prisma.sql`ORDER BY g."hoursWatched7d" DESC`;
    case "viewers":
    default:
      return Prisma.sql`ORDER BY g."currentViewers" DESC`;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const query = searchParams.get("q")?.trim() || null;
  const genre = searchParams.get("genre")?.trim() || null;
  const sort = searchParams.get("sort");

  const whereClause = buildWhereClause(genre, query);
  const orderClause = getOrderClause(sort);

  const [idRows, totalRows] = await Promise.all([
    db.$queryRaw<GameIdRow[]>(Prisma.sql`
      SELECT g.id
      FROM "Game" g
      ${whereClause}
      ${orderClause}
      LIMIT ${limit}
      OFFSET ${skip}
    `),
    db.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "Game" g
      ${whereClause}
    `),
  ]);

  const ids = idRows.map((row) => row.id);
  const total = Number(totalRows[0]?.total ?? 0n);

  if (!ids.length) {
    return NextResponse.json({
      data: [],
      meta: buildMeta(total, page, limit),
    });
  }

  const games = await db.game.findMany({
    where: { id: { in: ids } },
  });

  const gameById = new Map(games.map((game) => [game.id, game]));
  const data = ids
    .map((id) => gameById.get(id))
    .filter((game): game is NonNullable<typeof game> => Boolean(game));

  return NextResponse.json(
    serializeBigInt({
      data,
      meta: buildMeta(total, page, limit),
    }),
  );
}
