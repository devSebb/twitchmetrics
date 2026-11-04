import { describe, expect, it } from "vitest";
import {
  gameIdForName,
  indexGamesByName,
  STREAMHATCHET_GAME_NAME_OVERRIDES,
  streamHatchetNamesFor,
} from "./game-names";

/**
 * Stream Hatchet spells game names however its export does, and renamed many
 * in October 2026 (IGDB re-run). Every reader resolves names with these rules.
 */

describe("indexGamesByName", () => {
  it("matches regardless of case and spacing", () => {
    const index = indexGamesByName([
      { id: "game-1", name: "Counter-Strike 2" },
      { id: "game-2", name: " SEKIRO: SHADOWS DIE TWICE" },
    ]);

    expect(index.get("counter-strike 2")).toBe("game-1");
    expect(index.get("sekiro: shadows die twice")).toBe("game-2");
  });

  it("keeps the first game when two names normalise alike", () => {
    const index = indexGamesByName([
      { id: "first", name: "VALORANT" },
      { id: "second", name: "Valorant" },
    ]);

    expect(index.get("valorant")).toBe("first");
  });

  it("resolves the names SH files games under", () => {
    const index = indexGamesByName(
      [{ id: "cs2", name: "Counter-Strike 2" }],
      [{ name: "Counter-Strike", gameId: "cs2" }],
    );

    expect(index.get("counter-strike")).toBe("cs2");
  });

  it("lets a catalog name win over an alias", () => {
    const index = indexGamesByName(
      [{ id: "ow", name: "Overwatch" }],
      [{ name: "Overwatch", gameId: "ow2" }],
    );

    expect(index.get("overwatch")).toBe("ow");
  });

  it("drops an alias two games claim", () => {
    const index = indexGamesByName(
      [],
      [
        { name: "Lineage", gameId: "lineage" },
        { name: "Lineage", gameId: "lineage-2" },
      ],
    );

    expect(index.has("lineage")).toBe(false);
  });
});

describe("gameIdForName", () => {
  const index = indexGamesByName(
    [
      { id: "sports", name: "Sports" },
      { id: "helldivers", name: "HELLDIVERS 2" },
    ],
    [
      { name: "Animals", gameId: "animals-zoos" },
      { name: "Helldivers II", gameId: "helldivers" },
    ],
  );

  it("never matches a YouTube video category on YouTube", () => {
    expect(gameIdForName(index, "Sports", "yt")).toBeUndefined();
    expect(gameIdForName(index, "Sports", "ytg")).toBeUndefined();
    expect(gameIdForName(index, "Animals", "youtube")).toBeUndefined();
  });

  it("keeps the same names on Twitch and Kick, where they are categories", () => {
    expect(gameIdForName(index, "Sports", "twitch")).toBe("sports");
    expect(gameIdForName(index, "Animals", "kick")).toBe("animals-zoos");
  });

  it("resolves the spelling before and after a rename to one game", () => {
    expect(gameIdForName(index, "Helldivers II", "twitch")).toBe("helldivers");
    expect(gameIdForName(index, "Helldivers 2", "twitch")).toBe("helldivers");
  });
});

describe("streamHatchetNamesFor", () => {
  const games = [
    { id: "cs2", name: "Counter-Strike 2" },
    { id: "ow2", name: "Overwatch 2" },
  ];

  it("adds the names SH's discovery tied to the game", () => {
    const sources = {
      games,
      aliases: [{ name: "Counter-Strike", gameId: "cs2" }],
    };
    expect(
      streamHatchetNamesFor(
        "cs2",
        sources,
        indexGamesByName(sources.games, sources.aliases),
      ),
    ).toEqual(["Counter-Strike 2", "Counter-Strike"]);
  });

  it("drops an alias another game claims too", () => {
    const sources = {
      games,
      aliases: [
        { name: "Overwatch", gameId: "ow2" },
        { name: "Overwatch", gameId: "cs2" },
      ],
    };
    expect(
      streamHatchetNamesFor(
        "ow2",
        sources,
        indexGamesByName(sources.games, sources.aliases),
      ),
    ).toEqual(["Overwatch 2"]);
  });
});

describe("STREAMHATCHET_GAME_NAME_OVERRIDES", () => {
  it("names slugs, not display names", () => {
    for (const slug of Object.values(STREAMHATCHET_GAME_NAME_OVERRIDES)) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
