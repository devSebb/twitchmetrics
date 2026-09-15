import { describe, expect, it } from "vitest";
import {
  aggregateShRollups,
  combineViewerStats,
  extractSnapshotViewerStats,
  rollupWindowStart,
  viewerMetricsFromExtended,
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
      viewerPlatforms: [],
    });
    expect(combineViewerStats({ peak: null, avgSamples: [] }, null)).toEqual({
      peakViewers: null,
      avgViewers: null,
      peakPlatform: null,
      viewerPlatforms: [],
    });
  });
});
