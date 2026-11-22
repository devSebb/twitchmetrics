import { describe, expect, it } from "vitest";
import {
  continuationFacts,
  continuationPossible,
  continueBlock,
  isFullBlock,
} from "./continuation";
import type { RollupFact } from "./types";

/**
 * A Twitch 24/7 channel reaches the feed as 72 h blocks, each delivered with
 * the export of its last day. Until then its newest days are empty
 * (Caedrel 7D airtime 5 d 12 h against BI's 7 d, QA 2026-11).
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function fact(begins: string, ends: string, over: Partial<RollupFact> = {}) {
  const streamBeginsAt = new Date(begins);
  const streamEndsAt = new Date(ends);
  const airtimeMinutes = Math.round(
    (streamEndsAt.getTime() - streamBeginsAt.getTime()) / 60_000,
  );
  return {
    creatorProfileId: "caedrel",
    platformUserId: "caedrel247",
    platformUsername: "caedrel247",
    platformDisplayName: null,
    platformLogoUrl: null,
    country: null,
    streamBeginsAt,
    streamEndsAt,
    peakViewersAt: streamBeginsAt,
    primaryGameName: "League of Legends",
    allGameNames: [],
    gameMinutesByDay: {
      "2026-11-16": { "League of Legends": 1440 },
      "2026-11-17": { "League of Legends": 1000, "Always On": 440 },
      "2026-11-18": { "League of Legends": 1440 },
    },
    airtimeMinutes,
    minutesWatched: BigInt(airtimeMinutes * 1000),
    sessionViews: 5000n,
    averageViewers: 1000,
    averageViewersGlobal: null,
    peakViewers: 4000,
    bestRank: 3,
    averageRank: 5,
    worstRank: 9,
    ...over,
  } satisfies RollupFact;
}

// As stored: 16 Nov 00:00 to 19 Nov 00:01, delivered with the export of 18 Nov.
const block = fact("2026-11-16T00:00:00Z", "2026-11-19T00:01:00Z");

describe("isFullBlock", () => {
  it("accepts 72 h give or take a few minutes", () => {
    expect(isFullBlock(block)).toBe(true);
    expect(
      isFullBlock(fact("2026-11-16T00:00:00Z", "2026-11-18T23:59:00Z")),
    ).toBe(true);
  });

  it("rejects a channel that stopped mid-block and ordinary streams", () => {
    expect(
      isFullBlock(fact("2026-11-16T00:00:00Z", "2026-11-18T10:00:00Z")),
    ).toBe(false);
    expect(
      isFullBlock(fact("2026-11-16T18:00:00Z", "2026-11-17T02:00:00Z")),
    ).toBe(false);
  });
});

describe("continueBlock", () => {
  it("assumes the channel live up to the end of the newest imported day", () => {
    const next = continueBlock(block, day("2026-11-20"));
    expect(next?.streamBeginsAt).toEqual(day("2026-11-19"));
    expect(next?.streamEndsAt).toEqual(day("2026-11-21"));
    expect(next?.airtimeMinutes).toBe(2880);
  });

  it("carries the block's audience and game, and nothing it did not measure", () => {
    const next = continueBlock(block, day("2026-11-19"));
    expect(next).toMatchObject({
      platformUserId: "caedrel247",
      creatorProfileId: "caedrel",
      primaryGameName: "League of Legends",
      airtimeMinutes: 1440,
      minutesWatched: 1_440_000n,
      averageViewers: 1000,
      peakViewers: 1000,
      peakViewersAt: null,
      sessionViews: null,
      bestRank: null,
    });
  });

  it("splits each assumed day between games as the block was split", () => {
    const mix = { "League of Legends": 3880, "Always On": 440 };
    expect(continueBlock(block, day("2026-11-20"))?.gameMinutesByDay).toEqual({
      "2026-11-19": mix,
      "2026-11-20": mix,
    });
  });

  it("falls back to the block's game names when it has no game minutes", () => {
    const plain = { ...block, gameMinutesByDay: null };
    expect(
      continueBlock(plain, day("2026-11-19"))?.gameMinutesByDay,
    ).toBeNull();
  });

  it("stops once the export that would carry the next block is in", () => {
    // The next block runs 19-21 Nov and comes with the export of 21 Nov.
    expect(continueBlock(block, day("2026-11-21"))).toBeNull();
    expect(continueBlock(block, day("2026-11-25"))).toBeNull();
  });

  it("assumes nothing while the block's own days are the newest", () => {
    expect(continueBlock(block, day("2026-11-18"))).toBeNull();
  });

  it("never continues a shorter final stream", () => {
    const stopped = fact("2026-11-16T00:00:00Z", "2026-11-18T10:00:00Z");
    expect(continueBlock(stopped, day("2026-11-19"))).toBeNull();
  });
});

describe("continuationFacts", () => {
  const newest = day("2026-11-20");

  it("continues each channel from its newest block only", () => {
    const older = fact("2026-11-13T00:00:00Z", "2026-11-16T00:01:00Z");
    const result = continuationFacts(
      [older, block],
      new Map([["caedrel247", block.streamEndsAt.getTime()]]),
      newest,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.streamBeginsAt).toEqual(day("2026-11-19"));
  });

  it("skips a channel with any newer stream", () => {
    // Restarted after the block: a 5 h stream on 19 Nov.
    const result = continuationFacts(
      [block],
      new Map([["caedrel247", Date.parse("2026-11-19T15:00:00Z")]]),
      newest,
    );
    expect(result).toEqual([]);
  });

  it("handles channels independently", () => {
    const other = fact("2026-11-17T00:00:00Z", "2026-11-20T00:01:00Z", {
      platformUserId: "other247",
    });
    const result = continuationFacts([block, other], new Map(), newest);
    expect(result.map((f) => f.platformUserId).sort()).toEqual([
      "caedrel247",
      "other247",
    ]);
    // 20 Nov only: its block ended a day later.
    expect(
      result.find((f) => f.platformUserId === "other247")?.airtimeMinutes,
    ).toBe(1440);
  });
});

describe("continuationPossible", () => {
  it("is true only for the two newest days", () => {
    const newestDay = day("2026-11-20");
    expect(continuationPossible(day("2026-11-20"), newestDay)).toBe(true);
    expect(continuationPossible(day("2026-11-19"), newestDay)).toBe(true);
    expect(continuationPossible(day("2026-11-18"), newestDay)).toBe(false);
    expect(continuationPossible(day("2026-11-21"), newestDay)).toBe(false);
  });
});
