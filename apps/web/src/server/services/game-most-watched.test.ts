import { describe, expect, it } from "vitest";
import { indexGamesByName } from "@/server/services/streamhatchet/daily-game-platform";
import { mergeYouTubeFeeds, streamHatchetNamesFor } from "./game-most-watched";

describe("streamHatchetNamesFor", () => {
  const games = [
    { id: "cs2", name: "Counter-Strike 2" },
    { id: "ow2", name: "Overwatch 2" },
    { id: "sports", name: "Sports" },
  ];

  it("adds the names SH's discovery tied to the game", () => {
    const aliases = [{ name: "Counter-Strike", gameId: "cs2" }];
    expect(
      streamHatchetNamesFor(
        "cs2",
        ["Counter-Strike 2", "Counter-Strike"],
        indexGamesByName(games, aliases),
      ),
    ).toEqual(["Counter-Strike 2", "Counter-Strike"]);
  });

  it("drops an alias another game claims too", () => {
    const aliases = [
      { name: "Overwatch", gameId: "ow2" },
      { name: "Overwatch", gameId: "cs2" },
    ];
    expect(
      streamHatchetNamesFor(
        "ow2",
        ["Overwatch 2", "Overwatch"],
        indexGamesByName(games, aliases),
      ),
    ).toEqual(["Overwatch 2"]);
  });

  it("never matches a YouTube video category", () => {
    expect(
      streamHatchetNamesFor("sports", ["Sports"], indexGamesByName(games)),
    ).toEqual([]);
  });
});

describe("mergeYouTubeFeeds", () => {
  const row = (
    platform: string,
    platformUserId: string,
    minutes: number,
    creatorProfileId: string | null = null,
  ) => ({
    platform,
    platformUserId,
    minutesWatched: BigInt(minutes),
    airtimeMinutes: 60n,
    creatorProfileId,
    name: platformUserId,
  });

  it("adds a channel's yt and ytg hours together and re-ranks", () => {
    const merged = mergeYouTubeFeeds([
      row("twitch", "a", 900),
      row("yt", "b", 600),
      row("ytg", "b", 500, "profile-b"),
    ]);

    expect(
      merged.map((r) => [r.platform, r.platformUserId, r.minutesWatched]),
    ).toEqual([
      ["youtube", "b", 1100n],
      ["twitch", "a", 900n],
    ]);
    expect(merged[0]?.creatorProfileId).toBe("profile-b");
    expect(merged[0]?.airtimeMinutes).toBe(120n);
  });

  it("drops platforms we don't show", () => {
    expect(mergeYouTubeFeeds([row("facebook", "x", 10)])).toEqual([]);
  });
});
