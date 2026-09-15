import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted above the imports below) ---
vi.mock("@twitchmetrics/database", () => ({
  Prisma: { JsonNull: "JsonNull" },
  prisma: {
    ingestionRun: {
      update: vi.fn(async () => ({})),
    },
  },
}));

import { prisma } from "@twitchmetrics/database";
import {
  completeIngestionRun,
  failIngestionRun,
  resolveRunStatus,
} from "./runs";

type MockFn = ReturnType<typeof vi.fn>;
const update = (prisma as unknown as { ingestionRun: { update: MockFn } })
  .ingestionRun.update;

function lastUpdateData() {
  const call = update.mock.calls.at(-1) as
    | [{ data: Record<string, unknown> }]
    | undefined;
  return call?.[0].data;
}

describe("resolveRunStatus", () => {
  it("is degraded when the whole fetch failed", () => {
    expect(resolveRunStatus({ wholeFetchFailed: true })).toBe("degraded");
  });

  it("allows up to 25% of games skipped", () => {
    expect(resolveRunStatus({ gamesTotal: 4, gamesSkipped: 0 })).toBe(
      "completed",
    );
    expect(resolveRunStatus({ gamesTotal: 4, gamesSkipped: 1 })).toBe(
      "completed",
    );
    expect(resolveRunStatus({ gamesTotal: 100, gamesSkipped: 26 })).toBe(
      "degraded",
    );
    expect(resolveRunStatus({ gamesTotal: 5, gamesSkipped: 5 })).toBe(
      "degraded",
    );
  });

  it("is completed for an empty batch", () => {
    expect(resolveRunStatus({ gamesTotal: 0, gamesSkipped: 0 })).toBe(
      "completed",
    );
    expect(resolveRunStatus({})).toBe("completed");
  });
});

describe("completeIngestionRun", () => {
  beforeEach(() => update.mockClear());

  it("defaults to completed with no error summary", async () => {
    await completeIngestionRun("run-1", { recordsWritten: 3 });
    expect(lastUpdateData()).toMatchObject({
      status: "completed",
      recordsWritten: 3,
      errorSummary: null,
    });
  });

  it("writes degraded with its error summary", async () => {
    await completeIngestionRun("run-2", {
      status: "degraded",
      errorSummary: "StreamHatchet live games rate limited",
      metadata: { rateLimited: true },
    });
    expect(lastUpdateData()).toMatchObject({
      status: "degraded",
      errorSummary: "StreamHatchet live games rate limited",
      metadata: { rateLimited: true },
    });
  });

  it("keeps failed runs failed with the thrown message", async () => {
    await failIngestionRun("run-3", new Error("boom"), {
      status: "degraded",
    });
    expect(lastUpdateData()).toMatchObject({
      status: "failed",
      errorSummary: "boom",
    });
  });
});
