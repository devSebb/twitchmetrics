import { describe, expect, it } from "vitest";
import {
  allCreatorRankings,
  metricsForScope,
  rankedColumn,
  rankingExists,
  rankingPath,
  rankingPhrase,
  rankingSingular,
  scopesForMetric,
  windowStart,
} from "./rankings";

describe("which rankings are published", () => {
  it("offers viewership rankings only where streams are measured", () => {
    expect(rankingExists("twitch", "most-watched")).toBe(true);
    expect(rankingExists("all-platforms", "peak-viewers")).toBe(true);
    expect(rankingExists("instagram", "most-watched")).toBe(false);
    expect(rankingExists("x", "average-viewers")).toBe(false);
  });

  it("leaves Kick out of follower growth", () => {
    expect(scopesForMetric("fastest-growing")).toEqual([
      "all-platforms",
      "twitch",
      "youtube",
    ]);
  });

  it("ranks followers on every platform", () => {
    expect(scopesForMetric("most-followed")).toHaveLength(7);
    expect(metricsForScope("tiktok")).toEqual(["most-followed"]);
  });

  it("lists every published ranking exactly once", () => {
    const paths = allCreatorRankings().map(({ scope, metric }) =>
      rankingPath(scope, metric),
    );
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(22);
    expect(paths).toContain("/rankings/all-platforms/most-watched");
  });
});

describe("ranking copy", () => {
  it("names the platform where a reader expects it", () => {
    expect(rankingPhrase("twitch", "most-watched")).toBe(
      "most watched Twitch streamers",
    );
    expect(rankingPhrase("all-platforms", "peak-viewers")).toBe(
      "streamers by peak viewers",
    );
    expect(rankingPhrase("instagram", "most-followed")).toBe(
      "most followed streamers on Instagram",
    );
  });

  it("has a singular for the summary sentence", () => {
    expect(rankingSingular("kick", "average-viewers")).toBe(
      "Kick streamer with the highest average viewers",
    );
    expect(rankingSingular("x", "most-followed")).toBe(
      "most followed streamer on X",
    );
  });

  it("sorts each ranking by its own column", () => {
    expect(rankedColumn("most-watched")).toBe("hoursWatched");
    expect(rankedColumn("fastest-growing")).toBe("growth");
  });
});

describe("windowStart", () => {
  it("covers 30 days including the last one", () => {
    const start = windowStart(new Date("2026-11-23T00:00:00Z"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-10-25");
  });
});
