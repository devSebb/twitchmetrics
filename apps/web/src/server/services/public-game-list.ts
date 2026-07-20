import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import type { GameSort, NormalizedGameListFilters } from "@/lib/game-list";

type GameIdRow = { id: string };
type TotalRow = { total: bigint };

export function buildPublicGameWhereClause(filters: NormalizedGameListFilters) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`(g."currentChannels" > 0 OR g."hoursWatched7d" > 0)`,
  ];

  if (filters.genre) {
    conditions.push(Prisma.sql`g.genres @> ARRAY[${filters.genre}]::text[]`);
  }

  if (filters.query) {
    conditions.push(
      Prisma.sql`(g."searchText" % ${filters.query} OR g."searchText" ILIKE '%' || ${filters.query} || '%')`,
    );
  }

  if (filters.vertical !== "all") {
    conditions.push(Prisma.sql`g.vertical = ${filters.vertical}::"Vertical"`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

export function getPublicGameOrderClause(sort: GameSort) {
  switch (sort) {
    case "channels":
      return Prisma.sql`ORDER BY g."currentChannels" DESC, g.name ASC, g.id ASC`;
    case "hoursWatched":
      return Prisma.sql`ORDER BY g."hoursWatched7d" DESC, g.name ASC, g.id ASC`;
    case "viewers":
    default:
      return Prisma.sql`ORDER BY g."currentViewers" DESC, g.name ASC, g.id ASC`;
  }
}

export async function listPublicGames(filters: NormalizedGameListFilters) {
  const whereClause = buildPublicGameWhereClause(filters);
  const orderClause = getPublicGameOrderClause(filters.sort);

  const [idRows, totalRows] = await Promise.all([
    db.$queryRaw<GameIdRow[]>(Prisma.sql`
      SELECT g.id
      FROM "Game" g
      ${whereClause}
      ${orderClause}
      LIMIT ${filters.limit}
      OFFSET ${filters.skip}
    `),
    db.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "Game" g
      ${whereClause}
    `),
  ]);

  const ids = idRows.map((row) => row.id);
  const total = Number(totalRows[0]?.total ?? 0n);
  if (ids.length === 0) return { games: [], total };

  const games = await db.game.findMany({ where: { id: { in: ids } } });
  const gameById = new Map(games.map((game) => [game.id, game]));
  const orderedGames = ids
    .map((id) => gameById.get(id))
    .filter((game): game is NonNullable<typeof game> => Boolean(game));

  return { games: orderedGames, total };
}
