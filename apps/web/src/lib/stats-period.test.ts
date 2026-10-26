import { describe, expect, it } from "vitest";
import { pickStatsPeriod } from "./stats-period";

const LAST_DAY = new Date("2026-10-24T00:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("pickStatsPeriod", () => {
  it("keeps 30D when the last stream is inside the 30-day window", () => {
    expect(pickStatsPeriod(day("2026-10-24"), LAST_DAY)).toBe("30d");
    // 30 whole days ending Oct 24 start on Sep 25.
    expect(pickStatsPeriod(day("2026-09-25"), LAST_DAY)).toBe("30d");
  });

  it("opens on 3M when the last stream is 31–90 days back", () => {
    expect(pickStatsPeriod(day("2026-09-24"), LAST_DAY)).toBe("3m");
    expect(pickStatsPeriod(day("2026-07-27"), LAST_DAY)).toBe("3m");
  });

  it("opens on 6M, then 1Y, for older streams", () => {
    expect(pickStatsPeriod(day("2026-07-26"), LAST_DAY)).toBe("6m");
    expect(pickStatsPeriod(day("2026-04-28"), LAST_DAY)).toBe("6m");
    expect(pickStatsPeriod(day("2026-04-27"), LAST_DAY)).toBe("1y");
  });

  it("falls back to 30D when there is no stream or it is over a year old", () => {
    expect(pickStatsPeriod(null, LAST_DAY)).toBe("30d");
    expect(pickStatsPeriod(day("2025-10-01"), LAST_DAY)).toBe("30d");
  });

  it("ignores the time of day on the last complete day", () => {
    expect(
      pickStatsPeriod(day("2026-09-25"), new Date("2026-10-24T18:30:00Z")),
    ).toBe("30d");
  });
});
