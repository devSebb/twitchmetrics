import { describe, expect, it } from "vitest";
import type {
  CreatorRankingRow,
  RankingMovement,
} from "@/server/services/rankings";
import {
  creatorFaqs,
  creatorFilters,
  creatorStats,
  creatorSummary,
  type CreatorRankingSubject,
} from "./content";

const WINDOW_END = new Date("2026-11-23T00:00:00Z");

function row(
  rank: number,
  name: string,
  minutesWatched: number,
  movement: RankingMovement = { kind: "same" },
): CreatorRankingRow {
  return {
    rank,
    movement,
    value: minutesWatched,
    previousValue: null,
    stats: {
      minutesWatched,
      avgViewers: 1000 * (10 - rank),
      peakViewers: 5000 * (10 - rank),
      airtimeMinutes: 6000,
      followers: 100_000,
      followerDelta30d: null,
      followerPct30d: null,
    },
    creator: {
      slug: name.toLowerCase(),
      displayName: name,
      avatarUrl: null,
      primaryPlatform: "twitch",
      primaryGameName: null,
      platforms: ["twitch"],
    },
  };
}

const subject: CreatorRankingSubject = {
  scope: "twitch",
  metric: "most-watched",
  phrase: "most watched Twitch streamers",
  singular: "most watched Twitch streamer",
};

const rows = [
  row(1, "Ana", 6_000_000),
  row(2, "Ben", 3_000_000, { kind: "up", places: 4 }),
  row(3, "Cy", 1_200_000, { kind: "new" }),
];

describe("creatorSummary", () => {
  it("answers who leads, by how much, and who climbed", () => {
    expect(creatorSummary(subject, rows, WINDOW_END)).toBe(
      "As of 23 November 2026, Ana is the most watched Twitch streamer, with 100K hours watched in the last 30 days, ahead of Ben (50K hours watched) and Cy (20K hours watched). Ben climbed the most, up 4 places to number 2.",
    );
  });

  it("drops the period for a follower ranking", () => {
    const text = creatorSummary(
      {
        ...subject,
        metric: "most-followed",
        singular: "most followed Twitch streamer",
      },
      rows.slice(0, 1),
      WINDOW_END,
    );
    expect(text).not.toContain("last 30 days");
  });
});

describe("creatorStats", () => {
  it("always gives four tiles", () => {
    expect(creatorStats(rows)).toHaveLength(4);
    expect(
      creatorStats(rows.map((r) => ({ ...r, movement: { kind: "none" } }))),
    ).toHaveLength(4);
  });

  it("counts a creator who came from outside the list as new", () => {
    // Ben was 6th of a 3-row list last period, Cy was unranked: 2 entrants.
    const tile = creatorStats(rows).find((t) => t.label === "New this period");
    expect(tile?.value).toBe("2");
  });
});

describe("creatorFaqs", () => {
  it("names the top creators in the answer", () => {
    const faqs = creatorFaqs(subject, rows, WINDOW_END);
    expect(faqs[0]?.question).toBe(
      "Who is the most watched Twitch streamer right now?",
    );
    expect(faqs[1]?.answer).toBe("Ana, Ben and Cy.");
  });
});

describe("creatorFilters", () => {
  it("only links rankings that exist", () => {
    const games = [{ slug: "fortnite", name: "Fortnite" }];
    const kick = creatorFilters({ ...subject, scope: "kick" }, games);
    const rankedBy = kick.find((g) => g.label === "Ranked by");
    expect(rankedBy?.options.map((o) => o.label)).not.toContain(
      "Fastest growing",
    );
    // Game rankings are cross-platform: a platform page does not offer them.
    expect(kick.find((g) => g.label === "Game")).toBeUndefined();

    const all = creatorFilters({ ...subject, scope: "all-platforms" }, games);
    expect(all.find((g) => g.label === "Game")?.options[1]?.href).toBe(
      "/rankings/game/fortnite",
    );
  });
});
