import { describe, expect, it } from "vitest";
import {
  aggregateCreatorRollups,
  aggregateShRollups,
  clipVodsToWindow,
  computeFollowerGain,
  combineViewerStats,
  completeDayWindow,
  extractSnapshotViewerStats,
  rollupWindowStart,
  viewerMetricsFromExtended,
  vodIntervalsByDay,
  type CreatorRollupDay,
  type ShRollupTotals,
} from "./streaming-stats";

describe("rollupWindowStart", () => {
  it("truncates to UTC midnight so @db.Date boundary days are included", () => {
    const now = new Date("2026-07-28T14:30:00.000Z");
    const start = rollupWindowStart(30, now);
    // A rollup dated exactly 30 days ago is stored as midnight UTC and must
    // satisfy `date >= start`.
    expect(start.toISOString()).toBe("2026-06-28T00:00:00.000Z");
    const boundaryRollupDate = new Date("2026-06-28T00:00:00.000Z");
    expect(boundaryRollupDate.getTime()).toBeGreaterThanOrEqual(
      start.getTime(),
    );
  });

  it("handles windows crossing midnight", () => {
    const now = new Date("2026-07-28T00:10:00.000Z");
    expect(rollupWindowStart(7, now).toISOString()).toBe(
      "2026-07-21T00:00:00.000Z",
    );
  });
});

describe("completeDayWindow", () => {
  it("is N whole days ending on the last complete day", () => {
    const window = completeDayWindow(30, new Date("2026-10-18T00:00:00Z"));
    expect(window.start.toISOString()).toBe("2026-09-19T00:00:00.000Z");
    expect(window.lastDay.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("truncates a last day given with a time of day", () => {
    const window = completeDayWindow(7, new Date("2026-10-18T13:45:00Z"));
    expect(window.start.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(window.lastDay.toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });
});

describe("clipVodsToWindow", () => {
  const window = completeDayWindow(7, new Date("2026-10-18T00:00:00Z"));
  const vod = (startedAt: string, hours: number) => ({
    startedAt: new Date(startedAt),
    durationSeconds: hours * 3600,
  });

  it("keeps a VOD inside the window as is", () => {
    expect(clipVodsToWindow([vod("2026-10-15T18:00:00Z", 4)], window)).toEqual([
      vod("2026-10-15T18:00:00Z", 4),
    ]);
  });

  it("cuts a VOD that runs past the last midnight", () => {
    expect(clipVodsToWindow([vod("2026-10-18T22:00:00Z", 5)], window)).toEqual([
      vod("2026-10-18T22:00:00Z", 2),
    ]);
  });

  it("drops a VOD after the window", () => {
    expect(clipVodsToWindow([vod("2026-10-19T10:00:00Z", 3)], window)).toEqual(
      [],
    );
  });
});

describe("viewerMetricsFromExtended", () => {
  it("prefers PEAK_VIEWERS/AVG_VIEWERS and falls back to live count", () => {
    expect(
      viewerMetricsFromExtended({ PEAK_VIEWERS: 900, AVG_VIEWERS: 400 }),
    ).toEqual({ peak: 900, avg: 400 });
    expect(viewerMetricsFromExtended({ LIVE_VIEWER_COUNT: 250 })).toEqual({
      peak: 250,
      avg: 250,
    });
    expect(viewerMetricsFromExtended(null)).toEqual({ peak: null, avg: null });
  });
});

describe("extractSnapshotViewerStats", () => {
  it("takes the max peak and collects positive avg samples", () => {
    const stats = extractSnapshotViewerStats([
      {
        platform: "twitch",
        extendedMetrics: { PEAK_VIEWERS: 100, AVG_VIEWERS: 80 },
      },
      {
        platform: "twitch",
        extendedMetrics: { PEAK_VIEWERS: 300, AVG_VIEWERS: 120 },
      },
      { platform: "kick", extendedMetrics: { AVG_VIEWERS: 0 } },
      { platform: "youtube", extendedMetrics: null },
    ]);
    expect(stats.peak).toBe(300);
    expect(stats.peakPlatform).toBe("twitch");
    expect(stats.avgSamples).toEqual([80, 120]);
    expect(stats.platforms).toEqual(["twitch"]);
    expect(stats.avgPlatforms).toEqual(["twitch"]);
  });

  it("names the platform of the highest peak", () => {
    const stats = extractSnapshotViewerStats([
      { platform: "twitch", extendedMetrics: { PEAK_VIEWERS: 100 } },
      { platform: "kick", extendedMetrics: { PEAK_VIEWERS: 900 } },
    ]);
    expect(stats.peakPlatform).toBe("kick");
  });
});

describe("aggregateShRollups", () => {
  it("sums airtime, watch time, sessions and takes the max peak", () => {
    const totals = aggregateShRollups([
      {
        airtimeMinutes: 120,
        minutesWatched: 24_000n,
        sessionCount: 2,
        peakViewers: 500,
      },
      {
        airtimeMinutes: 60,
        minutesWatched: 3_000n,
        sessionCount: 1,
        peakViewers: null,
      },
    ]);
    expect(totals).toEqual({
      airtimeSeconds: 180 * 60,
      minutesWatched: 27_000,
      streamCount: 3,
      peak: 500,
      peakPlatform: null,
      peakCombined: false,
      airtimePlatforms: [],
      watchPlatforms: [],
    });
  });

  it("lists airtime/watch platforms and the peak platform from mapped rows", () => {
    const totals = aggregateShRollups([
      {
        airtimeMinutes: 240,
        minutesWatched: 50_000n,
        sessionCount: 1,
        peakViewers: 900,
        internalPlatform: "twitch",
      },
      {
        airtimeMinutes: 240,
        minutesWatched: 90_000n,
        sessionCount: 1,
        peakViewers: 1_500,
        internalPlatform: "youtube",
      },
      {
        airtimeMinutes: 30,
        minutesWatched: 0n,
        sessionCount: 1,
        peakViewers: null,
        internalPlatform: "kick",
      },
      {
        airtimeMinutes: 10,
        minutesWatched: 100n,
        sessionCount: 1,
        peakViewers: 5,
        internalPlatform: null,
      },
    ]);
    expect(totals.peakPlatform).toBe("youtube");
    expect(totals.airtimePlatforms).toEqual(["twitch", "youtube", "kick"]);
    expect(totals.watchPlatforms).toEqual(["twitch", "youtube"]);
  });
});

describe("combineViewerStats", () => {
  const shTotals = (
    overrides: Partial<ShRollupTotals> = {},
  ): ShRollupTotals => ({
    airtimeSeconds: 0,
    minutesWatched: 0,
    streamCount: 0,
    peak: null,
    peakPlatform: null,
    peakCombined: false,
    airtimePlatforms: [],
    watchPlatforms: [],
    ...overrides,
  });

  it("uses the watch-time-weighted SH average instead of a mean of means", () => {
    // 27,000 minutes watched over 180 minutes of airtime = 150 avg viewers.
    // An unweighted mix with the snapshot samples (80, 120) would distort it.
    const result = combineViewerStats(
      { peak: 300, avgSamples: [80, 120], avgPlatforms: ["twitch"] },
      shTotals({
        airtimeSeconds: 180 * 60,
        minutesWatched: 27_000,
        streamCount: 3,
        peak: 500,
        peakPlatform: "youtube",
        watchPlatforms: ["twitch", "youtube"],
      }),
    );
    expect(result.avgViewers).toBe(150);
    expect(result.peakViewers).toBe(500);
    expect(result.peakPlatform).toBe("youtube");
    expect(result.viewerPlatforms).toEqual(["twitch", "youtube"]);
  });

  it("marks the peak combined only when the SH estimate wins", () => {
    const combined = shTotals({
      airtimeSeconds: 60 * 60,
      minutesWatched: 6_000,
      peak: 500,
      peakPlatform: null,
      peakCombined: true,
    });

    // SH's combined estimate is the higher figure, so it is what is shown.
    expect(
      combineViewerStats({ peak: 300, avgSamples: [] }, combined).peakCombined,
    ).toBe(true);

    // A snapshot reading beats it: that number is one platform's, so the
    // label must not claim it combines platforms.
    const snapshotWins = combineViewerStats(
      { peak: 900, avgSamples: [], peakPlatform: "twitch" },
      combined,
    );
    expect(snapshotWins.peakViewers).toBe(900);
    expect(snapshotWins.peakCombined).toBe(false);
    expect(snapshotWins.peakPlatform).toBe("twitch");
  });

  it("falls back to the snapshot mean when SH has no airtime", () => {
    const result = combineViewerStats(
      {
        peak: 300,
        avgSamples: [80, 120],
        peakPlatform: "kick",
        avgPlatforms: ["kick"],
      },
      shTotals(),
    );
    expect(result.avgViewers).toBe(100);
    expect(result.peakViewers).toBe(300);
    expect(result.peakPlatform).toBe("kick");
    expect(result.viewerPlatforms).toEqual(["kick"]);
  });

  it("gives a peak tie to SH and reports the winning side's platform", () => {
    expect(
      combineViewerStats(
        { peak: 500, avgSamples: [], peakPlatform: "twitch" },
        shTotals({ peak: 500, peakPlatform: "youtube" }),
      ).peakPlatform,
    ).toBe("youtube");
    expect(
      combineViewerStats(
        { peak: 800, avgSamples: [], peakPlatform: "twitch" },
        shTotals({ peak: 500, peakPlatform: "youtube" }),
      ).peakPlatform,
    ).toBe("twitch");
  });

  it("reports no peak platform when the inputs carry none", () => {
    expect(
      combineViewerStats({ peak: 300, avgSamples: [] }, null).peakPlatform,
    ).toBeNull();
  });

  it("handles snapshot-only and SH-only inputs", () => {
    expect(combineViewerStats({ peak: 300, avgSamples: [100] }, null)).toEqual({
      peakViewers: 300,
      avgViewers: 100,
      peakPlatform: null,
      peakCombined: false,
      viewerPlatforms: [],
    });
    expect(
      combineViewerStats(
        { peak: null, avgSamples: [] },
        shTotals({
          airtimeSeconds: 3600,
          minutesWatched: 6_000,
          streamCount: 1,
          peak: 240,
        }),
      ),
    ).toEqual({
      peakViewers: 240,
      avgViewers: 100,
      peakPlatform: null,
      peakCombined: false,
      viewerPlatforms: [],
    });
    expect(combineViewerStats({ peak: null, avgSamples: [] }, null)).toEqual({
      peakViewers: null,
      avgViewers: null,
      peakPlatform: null,
      peakCombined: false,
      viewerPlatforms: [],
    });
  });
});

describe("vodIntervalsByDay", () => {
  it("splits a stream crossing midnight into one interval per UTC day", () => {
    const byDay = vodIntervalsByDay([
      {
        startedAt: new Date("2026-09-10T23:00:00.000Z"),
        durationSeconds: 7200,
      },
    ]);
    expect([...byDay.entries()]).toEqual([
      ["2026-09-10", [[1380, 1440]]],
      ["2026-09-11", [[0, 60]]],
    ]);
  });

  it("ignores zero-length VODs", () => {
    expect(
      vodIntervalsByDay([
        { startedAt: new Date("2026-09-10T10:00:00.000Z"), durationSeconds: 0 },
      ]).size,
    ).toBe(0);
  });
});

describe("aggregateCreatorRollups", () => {
  const day = (over: Partial<CreatorRollupDay> = {}): CreatorRollupDay => ({
    date: new Date("2026-09-10T00:00:00.000Z"),
    uniqueAirtimeMinutes: 240,
    minutesWatched: 2_880_000n,
    streamBlocks: 1,
    platforms: ["twitch", "youtube"],
    intervals: [[600, 840]],
    peakViewers: 15_000,
    peakPlatform: "twitch",
    ...over,
  });

  it("reports the merged simulcast airtime, so the average is not halved", () => {
    // The QA fixture: 4 h simulcast, 2.4M + 480k watch minutes. Summing the
    // channel rows would give 480 min of airtime and avg 6,000.
    const totals = aggregateCreatorRollups([
      day({ minutesWatched: 2_880_000n }),
    ]);
    expect(totals.airtimeSeconds).toBe(240 * 60);
    expect(combineViewerStats({ peak: null, avgSamples: [] }, totals)).toEqual({
      peakViewers: 15_000,
      avgViewers: 12_000,
      peakPlatform: "twitch",
      peakCombined: false,
      viewerPlatforms: ["twitch", "youtube"],
    });
  });

  it("does not add VOD time on a day Stream Hatchet already covers Twitch", () => {
    const totals = aggregateCreatorRollups(
      [day()],
      [
        {
          startedAt: new Date("2026-09-10T10:00:00.000Z"),
          durationSeconds: 4 * 3600,
        },
      ],
    );
    expect(totals.airtimeSeconds).toBe(240 * 60);
    expect(totals.vodMinutesAdded).toBe(0);
  });

  it("unions VOD time with a non-Twitch day instead of adding it", () => {
    // YouTube 10:00-14:00 stored; the Twitch VOD runs 12:00-16:00, so only the
    // two non-overlapping hours are new.
    const totals = aggregateCreatorRollups(
      [day({ platforms: ["youtube"], intervals: [[600, 840]] })],
      [
        {
          startedAt: new Date("2026-09-10T12:00:00.000Z"),
          durationSeconds: 4 * 3600,
        },
      ],
    );
    expect(totals.airtimeSeconds).toBe(360 * 60);
    expect(totals.vodMinutesAdded).toBe(120);
    expect(totals.streamBlocks).toBe(1);
    expect(totals.airtimePlatforms).toContain("twitch");
  });

  it("counts a VOD-only day in full", () => {
    const totals = aggregateCreatorRollups(
      [],
      [
        {
          startedAt: new Date("2026-09-12T08:00:00.000Z"),
          durationSeconds: 2 * 3600,
        },
      ],
    );
    expect(totals.airtimeSeconds).toBe(120 * 60);
    expect(totals.streamBlocks).toBe(1);
    expect(totals.airtimePlatforms).toEqual(["twitch"]);
  });

  it("keeps the stored figure when intervals are missing", () => {
    const totals = aggregateCreatorRollups(
      [day({ platforms: ["youtube"], intervals: null })],
      [
        {
          startedAt: new Date("2026-09-10T12:00:00.000Z"),
          durationSeconds: 3600,
        },
      ],
    );
    expect(totals.airtimeSeconds).toBe(240 * 60);
    expect(totals.vodMinutesAdded).toBe(0);
  });

  it("sums watch time across days and keeps the highest peak", () => {
    const totals = aggregateCreatorRollups([
      day({ peakViewers: 9_000, peakPlatform: "youtube" }),
      day({
        date: new Date("2026-09-11T00:00:00.000Z"),
        uniqueAirtimeMinutes: 120,
        minutesWatched: 600_000n,
        peakViewers: 21_000,
        peakPlatform: "kick",
        platforms: ["kick"],
      }),
    ]);
    expect(totals.airtimeSeconds).toBe(360 * 60);
    expect(totals.minutesWatched).toBe(3_480_000);
    expect(totals.peak).toBe(21_000);
    expect(totals.peakPlatform).toBe("kick");
    expect(totals.streamCount).toBe(2);
  });
});

describe("computeFollowerGain", () => {
  // 30 whole days: Sep 25 – Oct 24 (end = Oct 25 00:00, exclusive).
  const window = completeDayWindow(30, new Date("2026-10-24T00:00:00Z"));
  const at = (iso: string) => new Date(iso);
  const twitch = (iso: string, count: number | null) => ({
    platform: "twitch" as const,
    snapshotAt: at(iso),
    followerCount: count === null ? null : BigInt(count),
  });

  it("measures a polled series from the reading before the window start", () => {
    const result = computeFollowerGain(
      [
        twitch("2026-09-24T18:00:00Z", 1_000),
        twitch("2026-10-05T18:00:00Z", 1_040),
        twitch("2026-10-24T18:00:00Z", 1_100),
      ],
      window,
    );
    expect(result).toEqual({ gain: 100, platforms: ["twitch"], since: null });
  });

  it("is unmeasurable with no reading in the window (change-only data)", () => {
    // One catalog reading months ago: "no new snapshot" is not "no change".
    expect(
      computeFollowerGain([twitch("2026-03-01T00:00:00Z", 1_000)], window),
    ).toEqual({ gain: null, platforms: [], since: null });
  });

  it("rejects a months-old baseline against a fresh change", () => {
    // Would credit seven months of growth to this window.
    expect(
      computeFollowerGain(
        [
          twitch("2026-03-01T00:00:00Z", 100),
          twitch("2026-10-20T00:00:00Z", 150),
        ],
        window,
      ),
    ).toEqual({ gain: null, platforms: [], since: null });
  });

  it("rejects an end reading too far before the window end", () => {
    expect(
      computeFollowerGain(
        [
          twitch("2026-09-24T00:00:00Z", 100),
          twitch("2026-10-10T00:00:00Z", 150),
        ],
        window,
      ).gain,
    ).toBeNull();
  });

  it("does not count readings after the window", () => {
    expect(
      computeFollowerGain(
        [
          twitch("2026-09-24T00:00:00Z", 100),
          twitch("2026-10-23T00:00:00Z", 120),
          twitch("2026-10-26T00:00:00Z", 999),
        ],
        window,
      ).gain,
    ).toBe(20);
  });

  it("measures an honest zero when polls confirm an unchanged count", () => {
    expect(
      computeFollowerGain(
        [
          twitch("2026-09-24T12:00:00Z", 500),
          twitch("2026-10-24T12:00:00Z", 500),
        ],
        window,
      ),
    ).toEqual({ gain: 0, platforms: ["twitch"], since: null });
  });

  it("skips null-count readings instead of reading them as 0", () => {
    expect(
      computeFollowerGain(
        [
          twitch("2026-09-24T12:00:00Z", 500),
          twitch("2026-10-24T06:00:00Z", 510),
          twitch("2026-10-24T12:00:00Z", null),
        ],
        window,
      ).gain,
    ).toBe(10);
  });

  it("sums measurable platforms and leaves out the rest", () => {
    const result = computeFollowerGain(
      [
        twitch("2026-09-24T12:00:00Z", 500),
        twitch("2026-10-24T12:00:00Z", 530),
        {
          platform: "youtube",
          snapshotAt: at("2026-09-20T00:00:00Z"),
          followerCount: 10_000n,
        },
        {
          platform: "youtube",
          snapshotAt: at("2026-10-23T00:00:00Z"),
          followerCount: 10_200n,
        },
        // Kick: only an old reading, not measurable.
        {
          platform: "kick",
          snapshotAt: at("2026-06-01T00:00:00Z"),
          followerCount: 300n,
        },
      ],
      window,
    );
    expect(result.gain).toBe(230);
    expect(result.platforms.sort()).toEqual(["twitch", "youtube"]);
  });

  it("tightens the tolerance on short windows", () => {
    const week = completeDayWindow(7, new Date("2026-10-24T00:00:00Z"));
    // Start reading 3 days before a 7-day window: over 25 % of it.
    expect(
      computeFollowerGain(
        [
          twitch("2026-10-15T00:00:00Z", 100),
          twitch("2026-10-24T12:00:00Z", 110),
        ],
        week,
      ).gain,
    ).toBeNull();
    expect(
      computeFollowerGain(
        [
          twitch("2026-10-17T12:00:00Z", 100),
          twitch("2026-10-24T12:00:00Z", 110),
        ],
        week,
      ).gain,
    ).toBe(10);
  });
});

describe("computeFollowerGain, partial (6M / 1Y)", () => {
  // 1Y: Oct 25, 2025 – Oct 24, 2026.
  const year = completeDayWindow(365, new Date("2026-10-24T00:00:00Z"));
  const reading = (
    platform: "twitch" | "youtube",
    iso: string,
    count: number,
  ) => ({ platform, snapshotAt: new Date(iso), followerCount: BigInt(count) });

  it("covers the tracked span and says where it starts", () => {
    const result = computeFollowerGain(
      [
        reading("twitch", "2026-04-22T06:00:00Z", 1_000),
        reading("twitch", "2026-07-01T06:00:00Z", 1_500),
        reading("twitch", "2026-10-24T06:00:00Z", 2_000),
      ],
      year,
      { partial: true },
    );
    expect(result).toEqual({
      gain: 1_000,
      platforms: ["twitch"],
      since: new Date("2026-04-22T06:00:00Z"),
    });
  });

  it("starts every platform at the same, later first reading", () => {
    const result = computeFollowerGain(
      [
        reading("twitch", "2026-04-22T06:00:00Z", 1_000),
        reading("twitch", "2026-07-19T00:00:00Z", 1_400),
        reading("twitch", "2026-10-24T06:00:00Z", 2_000),
        reading("youtube", "2026-07-19T06:00:00Z", 50_000),
        reading("youtube", "2026-10-24T06:00:00Z", 51_000),
      ],
      year,
      { partial: true },
    );
    // Twitch from its Jul 19 reading, not Apr 22: one shared start date.
    expect(result.gain).toBe(600 + 1_000);
    expect(result.platforms.sort()).toEqual(["twitch", "youtube"]);
    expect(result.since).toEqual(new Date("2026-07-19T06:00:00Z"));
  });

  it("leaves out a platform with no reading near the shared start", () => {
    const result = computeFollowerGain(
      [
        // Twitch: change-only, nothing between March and October.
        reading("twitch", "2026-03-01T00:00:00Z", 100),
        reading("twitch", "2026-10-24T00:00:00Z", 900),
        reading("youtube", "2026-06-01T00:00:00Z", 5_000),
        reading("youtube", "2026-10-23T00:00:00Z", 5_500),
      ],
      year,
      { partial: true },
    );
    expect(result).toEqual({
      gain: 500,
      platforms: ["youtube"],
      since: new Date("2026-06-01T00:00:00Z"),
    });
  });

  it("needs at least 30 days of tracking", () => {
    expect(
      computeFollowerGain(
        [
          reading("twitch", "2026-10-01T00:00:00Z", 100),
          reading("twitch", "2026-10-24T00:00:00Z", 150),
        ],
        year,
        { partial: true },
      ).gain,
    ).toBeNull();
  });

  it("needs a recent end reading", () => {
    expect(
      computeFollowerGain(
        [
          reading("twitch", "2026-04-22T00:00:00Z", 100),
          reading("twitch", "2026-08-01T00:00:00Z", 150),
        ],
        year,
        { partial: true },
      ).gain,
    ).toBeNull();
  });

  it("prefers the full window when a platform covers it", () => {
    const result = computeFollowerGain(
      [
        reading("twitch", "2025-10-20T00:00:00Z", 100),
        reading("twitch", "2026-10-24T00:00:00Z", 400),
        reading("youtube", "2026-07-19T00:00:00Z", 5_000),
        reading("youtube", "2026-10-24T00:00:00Z", 6_000),
      ],
      year,
      { partial: true },
    );
    expect(result).toEqual({ gain: 300, platforms: ["twitch"], since: null });
  });

  it("stays strict without the partial option", () => {
    expect(
      computeFollowerGain(
        [
          reading("twitch", "2026-04-22T06:00:00Z", 1_000),
          reading("twitch", "2026-10-24T06:00:00Z", 2_000),
        ],
        year,
      ).gain,
    ).toBeNull();
  });
});
