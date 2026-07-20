import { describe, expect, it } from "vitest";
import {
  getPublicGameListCacheKey,
  normalizeGameListFilters,
  normalizeGameSort,
  normalizeGameVertical,
} from "./game-list";

describe("game list filter normalization", () => {
  it("uses the public browse defaults", () => {
    expect(normalizeGameListFilters({})).toEqual({
      sort: "viewers",
      vertical: "gaming",
      genre: null,
      query: null,
      page: 1,
      limit: 20,
      skip: 0,
    });
  });

  it("accepts every supported sort and vertical", () => {
    expect(normalizeGameSort("channels")).toBe("channels");
    expect(normalizeGameSort("hoursWatched")).toBe("hoursWatched");
    expect(normalizeGameVertical("music")).toBe("music");
    expect(normalizeGameVertical("all")).toBe("all");
  });

  it("normalizes invalid sort and vertical values", () => {
    expect(normalizeGameSort("newest")).toBe("viewers");
    expect(normalizeGameVertical("unknown")).toBe("gaming");
  });

  it("keeps genres only for the gaming vertical", () => {
    expect(
      normalizeGameListFilters({ vertical: "gaming", genre: " RPG " }).genre,
    ).toBe("RPG");
    expect(
      normalizeGameListFilters({ vertical: "irl", genre: "RPG" }).genre,
    ).toBeNull();
    expect(
      normalizeGameListFilters({ vertical: "all", genre: "RPG" }).genre,
    ).toBeNull();
  });

  it("normalizes pagination and caps the public limit", () => {
    expect(normalizeGameListFilters({ page: 3, limit: 25 })).toMatchObject({
      page: 3,
      limit: 25,
      skip: 50,
    });
    expect(normalizeGameListFilters({ page: -1, limit: 1_000 })).toMatchObject({
      page: 1,
      limit: 100,
      skip: 0,
    });
  });

  it("builds cache keys from normalized filters", () => {
    const filters = normalizeGameListFilters({
      vertical: "gaming",
      genre: "Action RPG",
      query: "final fantasy",
      page: 2,
    });

    expect(getPublicGameListCacheKey(filters)).toBe(
      "games:list:v2:p2:l20:sviewers:qfinal%20fantasy:gAction%20RPG:vgaming",
    );
  });
});
