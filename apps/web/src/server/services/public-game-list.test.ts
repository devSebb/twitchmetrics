import { describe, expect, it } from "vitest";
import { normalizeGameListFilters } from "@/lib/game-list";
import {
  buildPublicGameWhereClause,
  getPublicGameOrderClause,
} from "./public-game-list";

function renderSql(sql: { sql: string }) {
  return sql.sql;
}

describe("public game list query", () => {
  it("always limits results to games with recent or current activity", () => {
    const where = buildPublicGameWhereClause(
      normalizeGameListFilters({ vertical: "all" }),
    );

    expect(renderSql(where)).toContain(
      '(g."currentChannels" > 0 OR g."hoursWatched7d" > 0)',
    );
  });

  it("applies gaming genre, search, and vertical filters together", () => {
    const where = buildPublicGameWhereClause(
      normalizeGameListFilters({
        vertical: "gaming",
        genre: "RPG",
        query: "elden ring",
      }),
    );
    const sql = renderSql(where);

    expect(sql).toContain("g.genres @>");
    expect(sql).toContain('g."searchText" %');
    expect(sql).toContain("g.vertical =");
    expect(where.values).toEqual(["RPG", "elden ring", "elden ring", "gaming"]);
  });

  it("does not constrain vertical or genre when all verticals are requested", () => {
    const where = buildPublicGameWhereClause(
      normalizeGameListFilters({ vertical: "all", genre: "RPG" }),
    );
    const sql = renderSql(where);

    expect(sql).not.toContain("g.genres @>");
    expect(sql).not.toContain("g.vertical =");
  });

  it.each([
    ["viewers", 'g."currentViewers" DESC'],
    ["channels", 'g."currentChannels" DESC'],
    ["hoursWatched", 'g."hoursWatched7d" DESC'],
  ] as const)("uses stable ordering for %s", (sort, primaryOrder) => {
    const sql = renderSql(getPublicGameOrderClause(sort));

    expect(sql).toContain(primaryOrder);
    expect(sql).toContain("g.name ASC, g.id ASC");
  });
});
