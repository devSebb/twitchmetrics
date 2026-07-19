import { describe, expect, it } from "vitest";
import { buildSearchUrl, getSearchScopes, normalizeSearchType } from "./search";

describe("normalizeSearchType", () => {
  it.each(["all", "creators", "games"] as const)(
    "accepts the %s filter",
    (type) => {
      expect(normalizeSearchType(type)).toBe(type);
    },
  );

  it("falls back to all for missing or invalid filters", () => {
    expect(normalizeSearchType(undefined)).toBe("all");
    expect(normalizeSearchType(null)).toBe("all");
    expect(normalizeSearchType("channels")).toBe("all");
  });
});

describe("getSearchScopes", () => {
  it("searches both result sources for All", () => {
    expect(getSearchScopes("all")).toEqual({ creators: true, games: true });
  });

  it("excludes games for the Creators filter", () => {
    expect(getSearchScopes("creators")).toEqual({
      creators: true,
      games: false,
    });
  });

  it("excludes creators for the Games filter", () => {
    expect(getSearchScopes("games")).toEqual({
      creators: false,
      games: true,
    });
  });
});

describe("buildSearchUrl", () => {
  it("preserves selected filters when a new search is submitted", () => {
    expect(buildSearchUrl("just chatting", "creators")).toBe(
      "/search?q=just+chatting&type=creators",
    );
    expect(buildSearchUrl("just chatting", "games")).toBe(
      "/search?q=just+chatting&type=games",
    );
  });

  it("keeps All URLs canonical", () => {
    expect(buildSearchUrl(" minecraft ", "all")).toBe("/search?q=minecraft");
  });
});
