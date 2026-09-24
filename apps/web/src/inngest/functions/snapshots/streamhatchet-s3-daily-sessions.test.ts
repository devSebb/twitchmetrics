import { describe, expect, it } from "vitest";
import { assessImportHealth } from "./streamhatchet-s3-daily-sessions";

/**
 * Regression cover for two import bugs that a "completed" run hid.
 *
 * 2026-09-21: the raw insert omitted updatedAt (NOT NULL, no default), so every
 * batch containing a new row failed. The run reported completed having stored
 * nothing at all.
 *
 * 2026-09-20 onward: the export emits one row per (stream, category), so a
 * Twitch broadcast that switched game repeated a conflict key inside one
 * statement and Postgres rejected it (21000). Only Twitch broke, and it went
 * unnoticed for four days because the sweep still said completed.
 */

type Result = Parameters<typeof assessImportHealth>[0]["results"][number];

const result = (over: Partial<Result> = {}): Result =>
  ({
    platform: "twitch",
    date: "2026-09-23",
    key: "s3://export/twitch/2026-09-23.csv",
    scanned: 84_000,
    parsed: 84_000,
    written: 80_000,
    updated: 4_000,
    skipped: 0,
    failed: 0,
    matched: 0,
    skippedExisting: false,
    rollups: null,
    ...over,
  }) as Result;

const targets = [
  { platform: "kick" as const, matchedOnly: false },
  { platform: "yt" as const, matchedOnly: false },
  { platform: "twitch" as const, matchedOnly: false },
];

describe("assessImportHealth", () => {
  it("passes a clean sweep", () => {
    const health = assessImportHealth({
      targets,
      results: [
        result({ platform: "kick" }),
        result({ platform: "yt" }),
        result({ platform: "twitch" }),
      ],
      failures: [],
    });

    expect(health.status).toBe("completed");
    expect(health.errorSummary).toBeUndefined();
  });

  it("degrades when a platform stores nothing despite reporting success", () => {
    // The updatedAt bug: steps "succeeded", zero rows landed.
    const health = assessImportHealth({
      targets,
      results: targets.map((t) =>
        result({ platform: t.platform, written: 0, updated: 0 }),
      ),
      failures: [],
    });

    expect(health.status).toBe("degraded");
    expect(health.errorSummary).toContain("stored no rows");
  });

  it("degrades on a per-platform step failure", () => {
    // The 21000 bug: kick and yt fine, twitch failing every date.
    const health = assessImportHealth({
      targets,
      results: [result({ platform: "kick" }), result({ platform: "yt" })],
      failures: [
        {
          platform: "twitch",
          date: "2026-09-23",
          stage: "import",
          error: "Raw query failed. Code: `21000`.",
        },
        {
          platform: "twitch",
          date: "2026-09-22",
          stage: "import",
          error: "Raw query failed. Code: `21000`.",
        },
      ],
    });

    expect(health.status).toBe("degraded");
    expect(health.errorSummary).toContain("twitchx2");
  });

  it("does not flag a platform whose files were all already imported", () => {
    // Nothing to store is correct when every object was skipped.
    const health = assessImportHealth({
      targets,
      results: targets.map((t) =>
        result({
          platform: t.platform,
          written: 0,
          updated: 0,
          skippedExisting: true,
        }),
      ),
      failures: [],
    });

    expect(health.status).toBe("completed");
  });

  it("counts merges as stored rows", () => {
    // A re-sighted stream updates rather than inserts; that is real work.
    const health = assessImportHealth({
      targets,
      results: targets.map((t) =>
        result({ platform: t.platform, written: 0, updated: 12 }),
      ),
      failures: [],
    });

    expect(health.status).toBe("completed");
  });
});
