import { describe, expect, it } from "vitest";
import {
  dailyGameSnapshotValues,
  indexGamesByName,
} from "./daily-game-platform";

/**
 * C23 publishes YouTube game viewership from the daily rollups. The arithmetic
 * that matters is the 1440-minute division — a rollup is a day's total, and the
 * card shows a concurrent average — plus the name match, because the export
 * spells game names however it likes.
 */

describe("dailyGameSnapshotValues", () => {
  it("divides a day's totals into concurrent averages", () => {
    // 2,880,000 viewer-minutes over a day = 2,000 concurrent viewers.
    expect(
      dailyGameSnapshotValues({
        gameName: "Minecraft",
        airtimeMinutes: 14_400,
        minutesWatched: BigInt(2_880_000),
      }),
    ).toEqual({ viewers: 2000, channels: 10 });
  });

  it("accepts bigint or number minutesWatched", () => {
    const asBigint = dailyGameSnapshotValues({
      gameName: "Rust",
      airtimeMinutes: 1440,
      minutesWatched: BigInt(144_000),
    });
    const asNumber = dailyGameSnapshotValues({
      gameName: "Rust",
      airtimeMinutes: 1440,
      minutesWatched: 144_000,
    });
    expect(asBigint).toEqual(asNumber);
    expect(asBigint).toEqual({ viewers: 100, channels: 1 });
  });

  it("rounds rather than truncates", () => {
    expect(
      dailyGameSnapshotValues({
        gameName: "Fortnite",
        airtimeMinutes: 1080, // 0.75 of a day
        minutesWatched: BigInt(2160), // 1.5 viewers
      }),
    ).toEqual({ viewers: 2, channels: 1 });
  });

  it("reports zero for a game barely streamed", () => {
    expect(
      dailyGameSnapshotValues({
        gameName: "Obscure Indie",
        airtimeMinutes: 30,
        minutesWatched: BigInt(60),
      }),
    ).toEqual({ viewers: 0, channels: 0 });
  });
});

describe("indexGamesByName", () => {
  it("matches regardless of case and spacing", () => {
    const index = indexGamesByName([
      { id: "game-1", name: "Counter-Strike 2" },
      { id: "game-2", name: "Dead by Daylight" },
    ]);

    expect(index.get("counter-strike 2")).toBe("game-1");
    expect(index.get("dead by daylight")).toBe("game-2");
  });

  it("keeps the first game when two names normalise alike", () => {
    const index = indexGamesByName([
      { id: "first", name: "VALORANT" },
      { id: "second", name: "Valorant" },
    ]);

    expect(index.get("valorant")).toBe("first");
  });
});
