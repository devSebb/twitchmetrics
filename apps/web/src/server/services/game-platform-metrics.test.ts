import { describe, expect, it } from "vitest";
import {
  captionFor,
  isSnapshotFresh,
  preferSnapshot,
} from "./game-platform-metrics";
import { DAILY_GAME_SNAPSHOT_SOURCE } from "./streamhatchet/daily-game-platform";

/**
 * C23 fills the empty YouTube column with a daily average. The rule that makes
 * that safe is that it is only ever a fallback: a live reading outranks it no
 * matter how much older the live row is within its own freshness window.
 */

const live = (at: string) => ({
  source: "streamhatchet_live",
  snapshotAt: new Date(at),
});
const daily = (at: string) => ({
  source: DAILY_GAME_SNAPSHOT_SOURCE,
  snapshotAt: new Date(at),
});

describe("preferSnapshot", () => {
  it("takes anything over nothing", () => {
    expect(preferSnapshot(daily("2026-09-20T00:00:00Z"), undefined)).toBe(true);
  });

  it("keeps a live row even when a daily row is newer", () => {
    expect(
      preferSnapshot(
        daily("2026-09-21T00:00:00Z"),
        live("2026-09-20T12:00:00Z"),
      ),
    ).toBe(false);
  });

  it("replaces a daily row with a live one", () => {
    expect(
      preferSnapshot(
        live("2026-09-20T12:00:00Z"),
        daily("2026-09-21T00:00:00Z"),
      ),
    ).toBe(true);
  });

  it("prefers the twitch API over the Stream Hatchet live feed", () => {
    expect(
      preferSnapshot(
        { source: "twitch_api", snapshotAt: new Date("2026-09-21T09:00:00Z") },
        live("2026-09-21T10:00:00Z"),
      ),
    ).toBe(true);
  });

  it("falls back to recency within one source", () => {
    expect(
      preferSnapshot(
        live("2026-09-21T10:00:00Z"),
        live("2026-09-21T09:00:00Z"),
      ),
    ).toBe(true);
    expect(
      preferSnapshot(
        live("2026-09-21T08:00:00Z"),
        live("2026-09-21T09:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("captionFor", () => {
  it("labels a daily average with the day it covers", () => {
    expect(
      captionFor(DAILY_GAME_SNAPSHOT_SOURCE, new Date("2026-09-20T00:00:00Z")),
    ).toBe("daily avg · 2026-09-20");
  });

  it("leaves live readings uncaptioned", () => {
    expect(
      captionFor("twitch_api", new Date("2026-09-21T10:00:00Z")),
    ).toBeNull();
    expect(
      captionFor("streamhatchet_live", new Date("2026-09-21T10:00:00Z")),
    ).toBeNull();
  });
});

describe("isSnapshotFresh", () => {
  const covered = new Date("2026-09-20T00:00:00Z");
  const dailyRow = {
    source: DAILY_GAME_SNAPSHOT_SOURCE,
    // Written the next morning, when the export lands.
    snapshotAt: new Date("2026-09-21T08:10:00Z"),
    bucketStartedAt: covered,
  };

  it("survives until the import that replaces it", () => {
    // 2026-09-22 08:10 is the next import; the row must still show at 08:09.
    expect(isSnapshotFresh(dailyRow, Date.parse("2026-09-22T08:09:00Z"))).toBe(
      true,
    );
  });

  it("expires three days after the day it covers", () => {
    expect(isSnapshotFresh(dailyRow, Date.parse("2026-09-23T00:01:00Z"))).toBe(
      false,
    );
  });

  it("ignores when it was computed, so a backfill is not passed off as current", () => {
    const backfilled = {
      source: DAILY_GAME_SNAPSHOT_SOURCE,
      snapshotAt: new Date("2026-09-21T16:00:00Z"), // written today
      bucketStartedAt: new Date("2026-04-10T00:00:00Z"), // covers April
    };
    expect(
      isSnapshotFresh(backfilled, Date.parse("2026-09-21T16:05:00Z")),
    ).toBe(false);
  });

  it("holds live readings to two hours", () => {
    const liveRow = {
      source: "streamhatchet_live",
      snapshotAt: new Date("2026-09-21T10:00:00Z"),
      bucketStartedAt: new Date("2026-09-21T10:00:00Z"),
    };
    expect(isSnapshotFresh(liveRow, Date.parse("2026-09-21T11:30:00Z"))).toBe(
      true,
    );
    expect(isSnapshotFresh(liveRow, Date.parse("2026-09-21T12:30:00Z"))).toBe(
      false,
    );
  });
});
