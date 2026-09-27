import { describe, expect, it } from "vitest";
import { assessCreatorRollupHealth } from "./streamhatchet-creator-rollups";

/**
 * This sweep exists because the creator step used to be last inside the facts
 * import and was the first thing lost when the import ran long — 2026-09-24 to
 * 09-26 ended up with no creator rows at all, silently, while the import
 * reported success. So the sweep has to be loud when a date produces nothing.
 */

describe("assessCreatorRollupHealth", () => {
  const dates = ["2026-09-26", "2026-09-25", "2026-09-24", "2026-09-23"];

  it("passes when every date produced rows", () => {
    const health = assessCreatorRollupHealth({
      dates,
      results: dates.map((date) => ({ date, creatorRollups: 120_000 })),
      failures: [],
    });

    expect(health.status).toBe("completed");
    expect(health.errorSummary).toBeUndefined();
  });

  it("degrades and names the dates that failed", () => {
    const health = assessCreatorRollupHealth({
      dates,
      results: [{ date: "2026-09-23", creatorRollups: 120_000 }],
      failures: [
        { date: "2026-09-26", error: "timeout" },
        { date: "2026-09-25", error: "timeout" },
      ],
    });

    expect(health.status).toBe("degraded");
    expect(health.errorSummary).toContain("2/4 date(s) failed");
    expect(health.errorSummary).toContain("2026-09-26");
  });

  it("degrades when a date succeeds but writes nothing", () => {
    // The failure mode that hid for three days: no error, no rows.
    const health = assessCreatorRollupHealth({
      dates,
      results: dates.map((date, index) => ({
        date,
        creatorRollups: index === 0 ? 0 : 120_000,
      })),
      failures: [],
    });

    expect(health.status).toBe("degraded");
    expect(health.errorSummary).toContain("no creator rows for 2026-09-26");
  });

  it("reports both problems at once", () => {
    const health = assessCreatorRollupHealth({
      dates,
      results: [
        { date: "2026-09-25", creatorRollups: 0 },
        { date: "2026-09-24", creatorRollups: 120_000 },
      ],
      failures: [{ date: "2026-09-26", error: "timeout" }],
    });

    expect(health.status).toBe("degraded");
    expect(health.errorSummary).toContain("failed");
    expect(health.errorSummary).toContain("no creator rows");
  });
});
