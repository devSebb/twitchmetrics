import { describe, expect, it } from "vitest";
import {
  buildRollups,
  categoriesOf,
  dayOverlap,
  mostWatchedGame,
  splitEvenly,
  weightedAverage,
} from "./build";
import type { RollupFact, RollupContext } from "./types";

/**
 * Golden test for the grouping moved out of daily-sessions.ts (and its copy in
 * workers/streamhatchet-ingest.ts). The expectations below are what the old
 * code produced for this fixture — they must not move when the builder is
 * refactored (C25/C26 change semantics deliberately and will update them).
 */

const context: RollupContext = {
  source: "streamhatchet",
  platform: "twitch",
  date: new Date("2026-09-10T00:00:00.000Z"),
  matchedOnly: false,
};

function fact(overrides: Partial<RollupFact> = {}): RollupFact {
  return {
    creatorProfileId: "creator-1",
    platformUserId: "chan-1",
    platformUsername: "chan1",
    platformDisplayName: "Chan One",
    platformLogoUrl: null,
    country: "US",
    streamBeginsAt: new Date("2026-09-10T05:00:00.000Z"),
    streamEndsAt: new Date("2026-09-10T06:00:00.000Z"),
    peakViewersAt: new Date("2026-09-10T05:00:00.000Z"),
    primaryGameName: "Game A",
    allGameNames: ["Game A"],
    airtimeMinutes: 60,
    minutesWatched: 6_000n,
    sessionViews: 10n,
    averageViewersGlobal: 100,
    peakViewers: 200,
    bestRank: 5,
    averageRank: 10,
    worstRank: 20,
    ...overrides,
  };
}

// Ordered by streamEndsAt asc, as the loader guarantees.
const facts: RollupFact[] = [
  fact({
    streamBeginsAt: new Date("2026-09-10T05:00:00.000Z"),
    streamEndsAt: new Date("2026-09-10T06:00:00.000Z"),
    airtimeMinutes: 60,
    minutesWatched: 6_000n,
    peakViewers: 200,
    bestRank: 5,
    worstRank: 20,
  }),
  fact({
    platformDisplayName: "Chan One Renamed",
    streamBeginsAt: new Date("2026-09-10T10:00:00.000Z"),
    streamEndsAt: new Date("2026-09-10T12:00:00.000Z"),
    airtimeMinutes: 120,
    minutesWatched: 36_000n,
    sessionViews: 20n,
    averageViewersGlobal: 300,
    peakViewers: 400,
    peakViewersAt: new Date("2026-09-10T11:00:00.000Z"),
    primaryGameName: "Game B",
    allGameNames: ["Game B", "Game A"],
    bestRank: 2,
    averageRank: 4,
    worstRank: 8,
  }),
  fact({
    platformUserId: "chan-2",
    platformUsername: "chan2",
    platformDisplayName: "Chan Two",
    creatorProfileId: null,
    country: null,
    streamBeginsAt: new Date("2026-09-10T17:30:00.000Z"),
    streamEndsAt: new Date("2026-09-10T18:00:00.000Z"),
    airtimeMinutes: 30,
    minutesWatched: 900n,
    sessionViews: null,
    averageViewersGlobal: null,
    peakViewers: 50,
    peakViewersAt: null,
    primaryGameName: "Game A",
    allGameNames: [],
    bestRank: null,
    averageRank: null,
    worstRank: null,
  }),
  // No game: counts for the channel, contributes to no game rollup.
  fact({
    platformUserId: "chan-3",
    platformUsername: "chan3",
    streamBeginsAt: new Date("2026-09-10T19:15:00.000Z"),
    streamEndsAt: new Date("2026-09-10T20:00:00.000Z"),
    airtimeMinutes: 45,
    minutesWatched: 450n,
    primaryGameName: null,
    allGameNames: [],
    peakViewers: 10,
  }),
];

describe("buildRollups — channel rollups", () => {
  const { channel } = buildRollups(facts, context);
  const chan1 = channel.find((row) => row.platformUserId === "chan-1")!;

  it("sums the day's sessions per channel", () => {
    expect(channel).toHaveLength(3);
    expect(chan1).toMatchObject({
      source: "streamhatchet",
      platform: "twitch",
      sessionCount: 2,
      airtimeMinutes: 180,
      minutesWatched: 42_000n,
      sessionViews: 30n,
    });
  });

  it("derives averageViewers from the day's totals", () => {
    // 42,000 watch minutes over 180 airtime minutes.
    expect(chan1.averageViewers).toBeCloseTo(233.33, 2);
  });

  it("takes identity and lastStreamAt from the latest session", () => {
    expect(chan1.platformDisplayName).toBe("Chan One Renamed");
    expect(chan1.lastStreamAt).toEqual(new Date("2026-09-10T12:00:00.000Z"));
  });

  it("takes peak from the peak session, with its timestamp", () => {
    expect(chan1.peakViewers).toBe(400);
    expect(chan1.peakViewersAt).toEqual(new Date("2026-09-10T11:00:00.000Z"));
  });

  it("weights averageViewersGlobal and averageRank by airtime", () => {
    // (100*60 + 300*120) / 180
    expect(chan1.averageViewersGlobal).toBeCloseTo(233.33, 2);
    // (10*60 + 4*120) / 180
    expect(chan1.averageRank).toBeCloseTo(6, 5);
  });

  it("keeps best/worst rank extremes and ignores nulls", () => {
    expect(chan1.bestRank).toBe(2);
    expect(chan1.worstRank).toBe(20);
    const chan2 = channel.find((row) => row.platformUserId === "chan-2")!;
    expect(chan2.bestRank).toBeNull();
    expect(chan2.averageRank).toBeNull();
    expect(chan2.worstRank).toBeNull();
  });

  it("names the most-watched game and lists every game seen", () => {
    expect(chan1.primaryGameName).toBe("Game B");
    expect(chan1.gameNames).toEqual(["Game A", "Game B"]);
  });

  it("keeps a gameless channel, with no game", () => {
    const chan3 = channel.find((row) => row.platformUserId === "chan-3")!;
    expect(chan3.primaryGameName).toBeNull();
    expect(chan3.gameNames).toEqual([]);
    expect(chan3.airtimeMinutes).toBe(45);
  });

  it("carries a null creatorProfileId through unmatched channels", () => {
    const chan2 = channel.find((row) => row.platformUserId === "chan-2")!;
    expect(chan2.creatorProfileId).toBeNull();
  });
});

describe("buildRollups — game and channel-game rollups (C25 split)", () => {
  const { game, channelGame } = buildRollups(facts, context);

  it("gives every category a session played its own share", () => {
    // chan-1's second session plays Game B (primary) and Game A: its 120
    // airtime / 36,000 watch minutes split 60/60 and 18,000/18,000.
    const gameA = game.find((row) => row.gameName === "Game A")!;
    expect(gameA).toMatchObject({
      sessionCount: 3,
      channelCount: 2,
      airtimeMinutes: 150,
      minutesWatched: 24_900n,
      peakViewers: 400,
      topChannelUserId: "chan-1",
    });
    const gameB = game.find((row) => row.gameName === "Game B")!;
    expect(gameB).toMatchObject({
      sessionCount: 1,
      airtimeMinutes: 60,
      minutesWatched: 18_000n,
    });
  });

  it("conserves totals: sum over games equals sum over channels", () => {
    const { channel } = buildRollups(facts, context);
    const channelAirtimeWithGame = channel
      .filter((row) => row.primaryGameName !== null)
      .reduce((sum, row) => sum + row.airtimeMinutes, 0);
    const gameAirtime = game.reduce((sum, row) => sum + row.airtimeMinutes, 0);
    expect(gameAirtime).toBe(channelAirtimeWithGame);
  });

  it("splits one channel's day across its categories", () => {
    const chan1Rows = channelGame.filter(
      (row) => row.platformUserId === "chan-1",
    );
    expect(chan1Rows.map((row) => row.gameName).sort()).toEqual([
      "Game A",
      "Game B",
    ]);
    expect(chan1Rows.find((row) => row.gameName === "Game A")).toMatchObject({
      sessionCount: 2,
      airtimeMinutes: 120,
      minutesWatched: 24_000n,
    });
    expect(chan1Rows.find((row) => row.gameName === "Game B")).toMatchObject({
      sessionCount: 1,
      airtimeMinutes: 60,
      minutesWatched: 18_000n,
    });
  });

  it("skips platform-wide game totals for a matched-only import", () => {
    const matched = buildRollups(facts, { ...context, matchedOnly: true });
    expect(matched.game).toEqual([]);
    expect(matched.channel).toHaveLength(3);
    expect(matched.channelGame.length).toBeGreaterThan(0);
  });
});

describe("buildRollups — day attribution (C26)", () => {
  const dayTwo = new Date("2026-09-11T00:00:00.000Z");

  // One 72h stream: 2026-09-10 12:00Z → 2026-09-13 12:00Z.
  const longStream = fact({
    platformUserId: "always-on",
    streamBeginsAt: new Date("2026-09-10T12:00:00.000Z"),
    streamEndsAt: new Date("2026-09-13T12:00:00.000Z"),
    airtimeMinutes: 4320,
    minutesWatched: 432_000n,
    primaryGameName: "Game A",
    allGameNames: [],
    peakViewersAt: new Date("2026-09-11T06:00:00.000Z"),
  });

  it("credits each day only the hours it actually covers", () => {
    const first = buildRollups([longStream], context).channel[0]!;
    const middle = buildRollups([longStream], { ...context, date: dayTwo })
      .channel[0]!;
    expect(first.airtimeMinutes).toBe(720); // 12:00 → midnight
    expect(middle.airtimeMinutes).toBe(1440); // a full day
    expect(first.minutesWatched).toBe(72_000n);
    expect(middle.minutesWatched).toBe(144_000n);
  });

  it("never lets one day exceed 24 hours", () => {
    for (const day of [
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]) {
      const rows = buildRollups([longStream], {
        ...context,
        date: new Date(`${day}T00:00:00.000Z`),
      }).channel;
      expect(rows[0]!.airtimeMinutes).toBeLessThanOrEqual(1440);
    }
  });

  it("sums back to the full stream across its days", () => {
    const total = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]
      .map(
        (day) =>
          buildRollups([longStream], {
            ...context,
            date: new Date(`${day}T00:00:00.000Z`),
          }).channel[0]?.airtimeMinutes ?? 0,
      )
      .reduce((sum, minutes) => sum + minutes, 0);
    expect(total).toBe(4320);
  });

  it("ignores a stream that does not touch the day", () => {
    expect(
      buildRollups([longStream], {
        ...context,
        date: new Date("2026-09-20T00:00:00.000Z"),
      }).channel,
    ).toEqual([]);
  });

  it("keeps a short stream inside one day whole", () => {
    const short = buildRollups([facts[0]!], context).channel[0]!;
    expect(short.airtimeMinutes).toBe(60);
    expect(short.minutesWatched).toBe(6_000n);
  });
});

describe("rollup helpers", () => {
  it("weightedAverage ignores nulls and zero weights", () => {
    expect(
      weightedAverage([
        { value: 10, weight: 1 },
        { value: null, weight: 5 },
        { value: 99, weight: 0 },
      ]),
    ).toBe(10);
    expect(weightedAverage([{ value: null, weight: 1 }])).toBeNull();
    expect(weightedAverage([])).toBeNull();
  });

  it("mostWatchedGame breaks ties by name", () => {
    expect(
      mostWatchedGame([
        fact({ primaryGameName: "Zelda", minutesWatched: 100n }),
        fact({ primaryGameName: "Apex", minutesWatched: 100n }),
      ]),
    ).toBe("Apex");
    expect(mostWatchedGame([fact({ primaryGameName: null })])).toBeNull();
  });
});

describe("attribution helpers", () => {
  const day = new Date("2026-09-10T00:00:00.000Z");

  it("dayOverlap splits a stream crossing midnight", () => {
    const crossing = {
      streamBeginsAt: new Date("2026-09-09T23:00:00.000Z"),
      streamEndsAt: new Date("2026-09-10T01:00:00.000Z"),
    };
    expect(dayOverlap(crossing, day)).toEqual({ minutes: 60, fraction: 0.5 });
  });

  it("dayOverlap returns nothing for a stream outside the day", () => {
    expect(
      dayOverlap(
        {
          streamBeginsAt: new Date("2026-09-12T01:00:00.000Z"),
          streamEndsAt: new Date("2026-09-12T02:00:00.000Z"),
        },
        day,
      ),
    ).toEqual({ minutes: 0, fraction: 0 });
  });

  it("dayOverlap does not divide by zero on a zero-length stream", () => {
    const instant = new Date("2026-09-10T10:00:00.000Z");
    expect(
      dayOverlap({ streamBeginsAt: instant, streamEndsAt: instant }, day),
    ).toEqual({ minutes: 0, fraction: 1 });
  });

  it("categoriesOf dedupes case variants, primary first", () => {
    expect(
      categoriesOf({
        primaryGameName: "Fortnite",
        allGameNames: ["fortnite", "  ", "Apex Legends"],
      }),
    ).toEqual(["Fortnite", "Apex Legends"]);
    expect(categoriesOf({ primaryGameName: null, allGameNames: [] })).toEqual(
      [],
    );
  });

  it("splitEvenly conserves the total", () => {
    expect(splitEvenly(10, 3)).toEqual([4, 3, 3]);
    expect(splitEvenly(10, 3).reduce((a, b) => a + b, 0)).toBe(10);
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
    expect(splitEvenly(5, 0)).toEqual([]);
  });
});
