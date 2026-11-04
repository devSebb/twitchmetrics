import { describe, expect, it } from "vitest";
import { mergeYouTubeFeeds } from "./game-most-watched";

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
