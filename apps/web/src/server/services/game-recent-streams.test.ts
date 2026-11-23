import { describe, expect, it } from "vitest";
import { topStreamsPerDay, type StreamRow } from "./game-recent-streams";

const row = (
  platform: string,
  day: string,
  platformUserId: string,
  minutesWatched: number,
  extra: Partial<StreamRow> = {},
): StreamRow => ({
  platform,
  date: new Date(`${day}T00:00:00Z`),
  platformUserId,
  name: platformUserId,
  creatorProfileId: null,
  minutesWatched: BigInt(minutesWatched),
  airtimeMinutes: 60,
  peakViewers: null,
  ...extra,
});

describe("topStreamsPerDay", () => {
  it("lists the newest day first and the most watched stream first within it", () => {
    const top = topStreamsPerDay(
      [
        row("twitch", "2026-11-20", "a", 500),
        row("kick", "2026-11-21", "b", 100),
        row("twitch", "2026-11-21", "c", 900),
        row("ytg", "2026-11-20", "d", 800),
      ],
      5,
    );
    expect(top.map((stream) => stream.platformUserId)).toEqual([
      "c",
      "b",
      "d",
      "a",
    ]);
    expect(top[2]?.platform).toBe("youtube");
  });

  it("keeps the limit per day across platforms", () => {
    const top = topStreamsPerDay(
      [
        row("twitch", "2026-11-21", "a", 300),
        row("kick", "2026-11-21", "b", 200),
        row("yt", "2026-11-21", "c", 100),
        row("twitch", "2026-11-20", "d", 50),
      ],
      2,
    );
    expect(top.map((stream) => stream.platformUserId)).toEqual(["a", "b", "d"]);
  });

  it("adds up one channel's rows for a day: YouTube's two feeds, a game's spellings", () => {
    const [stream] = topStreamsPerDay(
      [
        row("yt", "2026-11-21", "UC1", 600, { peakViewers: 40 }),
        row("ytg", "2026-11-21", "UC1", 300, {
          peakViewers: 70,
          creatorProfileId: "profile",
        }),
      ],
      5,
    );
    expect(stream).toMatchObject({
      platform: "youtube",
      minutesWatched: 900n,
      airtimeMinutes: 120,
      peakViewers: 70,
      creatorProfileId: "profile",
    });
  });

  it("drops platforms the site doesn't show", () => {
    expect(
      topStreamsPerDay([row("facebook", "2026-11-21", "x", 10)], 5),
    ).toEqual([]);
  });
});
