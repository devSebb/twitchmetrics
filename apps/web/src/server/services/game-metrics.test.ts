import { describe, expect, it } from "vitest";
import { deriveGameMetrics } from "./game-metrics";

describe("deriveGameMetrics", () => {
  it("returns zeroed metrics when no snapshots exist", () => {
    expect(deriveGameMetrics([], new Date("2026-03-28T03:00:00.000Z"))).toEqual(
      {
        currentViewers: 0,
        currentChannels: 0,
        peakViewers24h: 0,
        avgViewers7d: 0,
        avgLiveChannels: 0,
        hoursWatched7d: 0n,
      },
    );
  });

  it("derives current, peak, averages, and viewer hours from recent snapshots", () => {
    const now = new Date("2026-03-28T03:00:00.000Z");
    const snapshots = [
      {
        snapshotAt: new Date("2026-03-28T01:30:00.000Z"),
        totalViewers: 100,
        totalChannels: 10,
      },
      {
        snapshotAt: new Date("2026-03-28T02:00:00.000Z"),
        totalViewers: 200,
        totalChannels: 20,
      },
      {
        snapshotAt: new Date("2026-03-28T02:30:00.000Z"),
        totalViewers: 300,
        totalChannels: 30,
      },
    ];

    expect(deriveGameMetrics(snapshots, now)).toEqual({
      currentViewers: 300,
      currentChannels: 30,
      peakViewers24h: 300,
      avgViewers7d: 200,
      avgLiveChannels: 20,
      hoursWatched7d: 300n,
    });
  });

  it("ignores snapshots outside the rolling windows for peak and averages", () => {
    const now = new Date("2026-03-28T03:00:00.000Z");
    const snapshots = [
      {
        snapshotAt: new Date("2026-03-20T03:00:00.000Z"),
        totalViewers: 999,
        totalChannels: 99,
      },
      {
        snapshotAt: new Date("2026-03-27T23:00:00.000Z"),
        totalViewers: 100,
        totalChannels: 10,
      },
      {
        snapshotAt: new Date("2026-03-28T02:30:00.000Z"),
        totalViewers: 200,
        totalChannels: 20,
      },
    ];

    expect(deriveGameMetrics(snapshots, now)).toEqual({
      currentViewers: 200,
      currentChannels: 20,
      peakViewers24h: 200,
      avgViewers7d: 150,
      avgLiveChannels: 15,
      hoursWatched7d: 150n,
    });
  });
});
