import { describe, expect, it } from "vitest";
import {
  buildGameSeries,
  columnTotals,
  dailyAverageKey,
  fillOutageDays,
  outageDays,
  slotTotals,
  summarizeGameSeries,
  SLOT_MS,
  type GameSeries,
  type SeriesPlatform,
  type SeriesReading,
} from "./game-viewer-series";

/**
 * The game page's header and charts read one series (QA 2026-11: they used
 * to read three sources that disagreed, and the charts were Twitch only).
 */

const T0 = Date.parse("2026-11-20T00:00:00Z");
const slot = (index: number) => new Date(T0 + index * SLOT_MS);

function reading(
  platform: SeriesPlatform,
  live: boolean,
  index: number,
  viewers: number,
  channels: number | null = 10,
): SeriesReading {
  return { platform, live, at: slot(index), viewers, channels };
}

const build = (
  readings: SeriesReading[],
  options: { slots?: number; allGames?: number[]; topGames?: number[] } = {},
) =>
  buildGameSeries({
    readings,
    allGamesSlots: new Set(
      (options.allGames ?? []).map((i) => slot(i).getTime()),
    ),
    topGamesSlots: new Set(
      (options.topGames ?? []).map((i) => slot(i).getTime()),
    ),
    since: slot(0),
    until: slot((options.slots ?? 4) - 1),
  });

describe("buildGameSeries", () => {
  it("takes Stream Hatchet's reading over the platform's own", () => {
    const series = build([
      reading("twitch", false, 0, 100, 5),
      reading("twitch", true, 0, 104, 9),
    ]);
    expect(series.viewers.twitch?.[0]).toBe(104);
    expect(series.channels.twitch?.[0]).toBe(9);
  });

  it("falls back to the platform's own reading when Stream Hatchet has none", () => {
    const series = build([
      reading("twitch", true, 0, 104),
      reading("twitch", false, 1, 98),
      reading("twitch", true, 2, 110),
    ]);
    expect(series.viewers.twitch).toEqual([104, 98, 110, 110]);
  });

  it("leaves out an API channel count that sits at the API's limit", () => {
    const series = build([
      reading("twitch", false, 0, 250_000, 4_962),
      reading("kick", false, 0, 9_000, 100),
      reading("kick", false, 2, 9_000, 99),
    ]);
    expect(series.viewers.twitch?.[0]).toBe(250_000);
    expect(series.channels.twitch).toBeUndefined();
    expect(series.channels.kick).toEqual([null, null, 99, 99]);
  });

  it("takes channels from the slot before when the API's count is capped", () => {
    // Stream Hatchet read hourly, Kick's API on the hours between.
    const series = build([
      reading("kick", true, 0, 9_100, 330),
      reading("kick", false, 1, 9_000, 100),
      reading("kick", true, 2, 9_300, 340),
    ]);
    expect(series.viewers.kick).toEqual([9_100, 9_000, 9_300, 9_300]);
    expect(series.channels.kick).toEqual([330, 330, 340, 340]);
  });

  it("carries a reading for up to an hour", () => {
    // Kick's API is read hourly, and the next reading can land a slot late.
    const series = build(
      [reading("kick", false, 0, 500), reading("kick", false, 5, 700)],
      { slots: 6 },
    );
    expect(series.viewers.kick).toEqual([500, 500, 500, null, null, 700]);
  });

  it("reads the slot before the window for the first carry", () => {
    const series = build([
      reading("kick", false, -1, 500),
      reading("twitch", false, 0, 90),
    ]);
    expect(series.viewers.kick?.[0]).toBe(500);
  });

  it("counts a missing platform as nobody watching when the call kept every game", () => {
    const series = build([reading("twitch", false, 0, 90)], {
      slots: 1,
      allGames: [0],
    });
    expect(series.viewers).toEqual({ twitch: [90], kick: [0], youtube: [0] });
  });

  it("keeps the platform's own reading over that zero", () => {
    // Stream Hatchet spells the game differently and never lists it.
    const series = build(
      [
        reading("twitch", false, 0, 90),
        reading("kick", false, 0, 40),
        reading("twitch", false, 1, 95),
      ],
      { slots: 2, allGames: [0, 1] },
    );
    expect(series.viewers.twitch).toEqual([90, 95]);
    expect(series.viewers.kick).toEqual([40, 40]);
  });

  it("leaves a platform unknown when the call didn't keep every game", () => {
    const series = build([reading("twitch", false, 0, 90)], { slots: 1 });
    expect(series.viewers).toEqual({ twitch: [90] });
  });

  describe("calls that kept the 100 biggest games only", () => {
    const topGames = [0, 2, 4, 6];

    it("keeps the readings of a game listed in most of them", () => {
      const series = build(
        [
          reading("youtube", true, 0, 20_000),
          reading("youtube", true, 2, 22_000),
          reading("youtube", true, 6, 21_000),
        ],
        { slots: 8, topGames },
      );
      expect(series.viewers.youtube?.[0]).toBe(20_000);
    });

    it("leaves out a game listed only at its spikes, until every game is kept", () => {
      const series = build(
        [
          reading("twitch", false, 0, 600),
          reading("youtube", true, 2, 4_500),
          reading("twitch", false, 7, 650),
          reading("youtube", true, 7, 40),
        ],
        { slots: 8, topGames, allGames: [7] },
      );
      expect(series.viewers.youtube).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        40,
      ]);
    });
  });

  it("starts at the first slot with a reading and has every slot after it", () => {
    const series = build(
      [reading("twitch", false, 3, 90), reading("twitch", false, 7, 80)],
      { slots: 8 },
    );
    expect(series.slots).toEqual(
      [3, 4, 5, 6, 7].map((i) => slot(i).toISOString()),
    );
    expect(series.viewers.twitch).toEqual([90, 90, 90, null, 80]);
  });

  it("keeps the later of two readings in one slot", () => {
    const series = build([
      {
        platform: "twitch",
        live: false,
        at: new Date(T0 + 60_000),
        viewers: 10,
        channels: 1,
      },
      {
        platform: "twitch",
        live: false,
        at: new Date(T0 + 120_000),
        viewers: 12,
        channels: 1,
      },
    ]);
    expect(series.viewers.twitch?.[0]).toBe(12);
  });
});

describe("summarizeGameSeries", () => {
  const DAY_SLOTS = 48;
  const flat = (value: number | null, count: number) =>
    new Array<number | null>(count).fill(value);
  const seriesOf = (
    viewers: GameSeries["viewers"],
    channels: GameSeries["channels"] = {},
  ): GameSeries => {
    const count = Object.values(viewers)[0]!.length;
    return {
      slots: Array.from({ length: count }, (_, i) => slot(i).toISOString()),
      viewers,
      channels,
    };
  };

  it("averages each platform and adds the averages up", () => {
    const summary = summarizeGameSeries(
      seriesOf(
        { twitch: [100, 200], kick: [10, 30], youtube: [null, 40] },
        { twitch: [4, 6] },
      ),
    );
    expect(summary.avgViewers.rows.map((row) => row.value)).toEqual([
      150, 20, 40,
    ]);
    expect(summary.avgViewers.total).toBe(210);
    expect(summary.avgChannels).toEqual({
      rows: [{ platform: "twitch", value: 5, since: null }],
      total: 5,
    });
  });

  it("totals the peak as the highest combined moment, not the sum of peaks", () => {
    const summary = summarizeGameSeries(
      seriesOf({ twitch: [900, 100], youtube: [50, 700] }),
    );
    expect(summary.peakViewers24h.rows.map((row) => row.value)).toEqual([
      900, 700,
    ]);
    expect(summary.peakViewers24h.total).toBe(950);
  });

  it("looks for the 24-hour peak in the last day only", () => {
    const summary = summarizeGameSeries(
      seriesOf({
        twitch: [5_000, ...flat(100, DAY_SLOTS - 1), 300],
      }),
    );
    expect(summary.peakViewers24h.total).toBe(300);
    expect(summary.peakViewers).toBe(5_000);
  });

  it("says since when for a platform that starts more than a day in", () => {
    const summary = summarizeGameSeries(
      seriesOf({
        twitch: flat(100, DAY_SLOTS * 3),
        kick: [...flat(null, 10), ...flat(20, DAY_SLOTS * 3 - 10)],
        youtube: [...flat(null, DAY_SLOTS * 2), ...flat(60, DAY_SLOTS)],
      }),
    );
    expect(summary.avgViewers.rows.map((row) => row.since)).toEqual([
      null,
      null,
      slot(DAY_SLOTS * 2).toISOString(),
    ]);
  });
});

describe("outage days", () => {
  // Two UTC days of 4 slots each, to keep the fixtures readable.
  const slots = [
    "2026-11-17T00:00:00.000Z",
    "2026-11-17T06:00:00.000Z",
    "2026-11-17T12:00:00.000Z",
    "2026-11-17T18:00:00.000Z",
    "2026-11-18T00:00:00.000Z",
    "2026-11-18T06:00:00.000Z",
    "2026-11-18T12:00:00.000Z",
    "2026-11-18T18:00:00.000Z",
  ];
  const series: GameSeries = {
    slots,
    viewers: {
      twitch: [100, 110, 120, 130, 140, null, null, null],
      kick: [10, 10, 10, 10, null, null, null, 30],
    },
    channels: { twitch: [5, 5, 5, 5, 6, null, null, null] },
  };
  const daily = new Map([
    [dailyAverageKey("twitch", "2026-11-18"), 90],
    [dailyAverageKey("kick", "2026-11-18"), 20],
    [dailyAverageKey("youtube", "2026-11-18"), 50],
  ]);

  it("finds the days most Twitch slots are empty", () => {
    expect(outageDays(series)).toEqual(["2026-11-18"]);
  });

  it("ignores one missed run", () => {
    expect(
      outageDays({
        ...series,
        viewers: { twitch: [100, 110, 120, 130, 140, null, 150, 160] },
      }),
    ).toEqual([]);
  });

  it("sets the empty viewer slots to the day's average and keeps readings", () => {
    const filled = fillOutageDays(series, ["2026-11-18"], daily);
    expect(filled.viewers.twitch).toEqual([
      100, 110, 120, 130, 140, 90, 90, 90,
    ]);
    expect(filled.viewers.kick).toEqual([10, 10, 10, 10, 20, 20, 20, 30]);
    expect(filled.estimated).toEqual({
      twitch: [[5, 7]],
      kick: [[4, 6]],
    });
  });

  it("leaves channels and platforms we weren't reading alone", () => {
    const filled = fillOutageDays(series, ["2026-11-18"], daily);
    expect(filled.channels).toEqual(series.channels);
    expect(filled.viewers.youtube).toBeUndefined();
  });

  it("returns the series as it was when the daily data has nothing", () => {
    expect(fillOutageDays(series, ["2026-11-18"], new Map())).toBe(series);
  });

  it("counts filled slots in the average but not in the peaks", () => {
    const filled = fillOutageDays(
      { ...series, viewers: { twitch: series.viewers.twitch! } },
      ["2026-11-18"],
      new Map([[dailyAverageKey("twitch", "2026-11-18"), 900]]),
    );
    const summary = summarizeGameSeries(filled);
    expect(summary.avgViewers.total).toBe(
      Math.round((100 + 110 + 120 + 130 + 140 + 900 * 3) / 8),
    );
    expect(summary.peakViewers).toBe(140);
    expect(summary.peakViewers24h.total).toBe(140);
  });

  it("keeps a reading in the peak when another platform's slot is filled", () => {
    const summary = summarizeGameSeries(
      fillOutageDays(series, ["2026-11-18"], daily),
    );
    // 140 on Twitch at a slot where Kick holds its daily average of 20.
    expect(summary.peakViewers).toBe(140);
  });
});

describe("columnTotals", () => {
  it("adds the platforms that have a value and stays empty when none has", () => {
    expect(
      columnTotals({ twitch: [1, null, null], kick: [2, 5, null] }, 3),
    ).toEqual([3, 5, null]);
  });
});

describe("slotTotals", () => {
  const at = (index: number) => slot(index);
  const row = (
    platform: SeriesPlatform,
    source: string,
    index: number,
    viewers: number,
    channels: number | null,
  ) => ({ platform, source, bucketStartedAt: at(index), viewers, channels });

  it("adds Kick and YouTube to Twitch", () => {
    expect(
      slotTotals({ viewers: 1_000, channels: 50 }, [
        row("kick", "streamhatchet_live", 2, 300, 20),
        row("youtube", "streamhatchet_live", 2, 200, 5),
      ]),
    ).toEqual({
      kickViewers: 300,
      kickChannels: 20,
      youtubeViewers: 200,
      youtubeChannels: 5,
      totalViewers: 1_500,
      totalChannels: 75,
    });
  });

  it("takes Stream Hatchet's reading over a newer one from the API", () => {
    const totals = slotTotals({ viewers: 250_000, channels: 4_962 }, [
      row("twitch", "streamhatchet_live", 1, 262_000, 12_300),
      row("kick", "streamhatchet_live", 1, 9_000, 330),
      row("kick", "kick_api", 2, 8_800, 100),
    ]);
    expect(totals.totalViewers).toBe(271_000);
    expect(totals.totalChannels).toBe(12_630);
    expect(totals.kickChannels).toBe(330);
  });

  it("is Twitch's own reading when nothing else was read", () => {
    expect(slotTotals({ viewers: 80, channels: 3 }, [])).toMatchObject({
      totalViewers: 80,
      totalChannels: 3,
    });
  });
});
