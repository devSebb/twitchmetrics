import { describe, expect, it } from "vitest";
import {
  demographicsFreshness,
  selectDisplayableDemographics,
  getMetricFreshness,
  getLatestTimestamp,
  isRecentObservation,
  VERIFIED_LIVE_MAX_AGE_MS,
} from "./metric-freshness";

const NOW = new Date("2026-07-18T12:00:00.000Z").getTime();

describe("metric freshness", () => {
  it("only treats recent observations as verified live data", () => {
    expect(
      isRecentObservation(
        new Date(NOW - VERIFIED_LIVE_MAX_AGE_MS),
        undefined,
        NOW,
      ),
    ).toBe(true);
    expect(
      isRecentObservation(
        new Date(NOW - VERIFIED_LIVE_MAX_AGE_MS - 1),
        undefined,
        NOW,
      ),
    ).toBe(false);
    expect(isRecentObservation(null, undefined, NOW)).toBe(false);
  });

  it("rejects invalid and future observations", () => {
    expect(isRecentObservation("not-a-date", undefined, NOW)).toBe(false);
    expect(isRecentObservation(new Date(NOW + 60_000), undefined, NOW)).toBe(
      false,
    );
  });

  it("formats fresh, possibly outdated, and outdated timestamps", () => {
    expect(getMetricFreshness(new Date(NOW - 5 * 60_000), NOW)).toEqual({
      relativeTime: "5m ago",
      state: "fresh",
    });
    expect(
      getMetricFreshness(new Date(NOW - 3 * 24 * 60 * 60_000), NOW),
    ).toEqual({ relativeTime: "3d ago", state: "possibly_outdated" });
    expect(
      getMetricFreshness(new Date(NOW - 8 * 24 * 60 * 60_000), NOW),
    ).toEqual({ relativeTime: "8d ago", state: "outdated" });
  });

  it("selects the latest valid source timestamp", () => {
    expect(
      getLatestTimestamp([
        "not-a-date",
        new Date("2026-07-17T12:00:00.000Z"),
        null,
        "2026-07-18T11:00:00.000Z",
      ]),
    ).toEqual(new Date("2026-07-18T11:00:00.000Z"));
  });
});

describe("demographicsFreshness", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("uses whole calendar months for the stale and hide thresholds", () => {
    expect(demographicsFreshness("2025-04-15T12:00:00.000Z", now)).toBe(
      "fresh",
    ); // 17 months
    expect(demographicsFreshness("2025-03-15T12:00:00.000Z", now)).toBe(
      "stale",
    ); // exactly 18
    expect(demographicsFreshness("2025-03-16T00:00:00.000Z", now)).toBe(
      "fresh",
    ); // one day short of 18
    expect(demographicsFreshness("2023-10-15T12:00:00.000Z", now)).toBe(
      "stale",
    ); // 35
    expect(demographicsFreshness("2023-09-15T12:00:00.000Z", now)).toBe(
      "hidden",
    ); // exactly 36
  });

  it("treats future dates as fresh and missing dates as stale", () => {
    expect(demographicsFreshness("2027-01-01T00:00:00.000Z", now)).toBe(
      "fresh",
    );
    expect(demographicsFreshness(null, now)).toBe("stale");
    expect(demographicsFreshness("not a date", now)).toBe("stale");
  });
});

describe("selectDisplayableDemographics", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("orders newest report first, drops hidden rows and tags the rest", () => {
    const rows = [
      { platform: "instagram", dpUpdatedAt: "2022-05-16T00:00:00.000Z" },
      { platform: "x", dpUpdatedAt: null },
      { platform: "tiktok", dpUpdatedAt: "2026-08-01T00:00:00.000Z" },
      { platform: "youtube", dpUpdatedAt: "2024-06-01T00:00:00.000Z" },
    ];
    expect(selectDisplayableDemographics(rows, now)).toEqual([
      {
        platform: "tiktok",
        dpUpdatedAt: "2026-08-01T00:00:00.000Z",
        freshness: "fresh",
      },
      {
        platform: "youtube",
        dpUpdatedAt: "2024-06-01T00:00:00.000Z",
        freshness: "stale",
      },
      { platform: "x", dpUpdatedAt: null, freshness: "stale" },
    ]);
  });

  it("returns nothing when every report is too old", () => {
    expect(
      selectDisplayableDemographics(
        [{ platform: "instagram", dpUpdatedAt: "2022-05-16T00:00:00.000Z" }],
        now,
      ),
    ).toEqual([]);
  });
});
