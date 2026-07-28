import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";

const log = createLogger("finalize-stale-ingestion-runs");

// A run stuck in "running" past this age is dead: Vercel functions cap out at
// minutes, and Inngest retries exhaust well within a day. Local worker runs
// (catalog builds/backfills) can legitimately exceed this — being marked
// failed is cosmetic for those; the errorSummary says so.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Self-healing for IngestionRun bookkeeping: any run that crashed or was
 * interrupted before finalizing leaves a permanent status="running" row,
 * which pollutes admin health views (105k such rows accumulated before the
 * 2026-07-27 cleanup). This marks them failed daily so crashes are visible
 * as crashes and nothing accumulates.
 *
 * Deliberately NOT wrapped in executeIngestionRun — the janitor must never
 * be able to orphan its own run row.
 */
export const finalizeStaleIngestionRuns = inngest.createFunction(
  { id: "finalize-stale-ingestion-runs", concurrency: { limit: 1 } },
  [{ cron: "40 6 * * *" }, { event: "maintenance/finalize-stale-runs" }],
  async ({ step }) => {
    const finalized = await step.run("finalize-stale-runs", async () => {
      const cutoff = new Date(Date.now() - STALE_AFTER_MS);
      const result = await prisma.ingestionRun.updateMany({
        where: { status: "running", startedAt: { lt: cutoff } },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorSummary:
            "Auto-finalized: still 'running' after 24h — the run crashed or " +
            "was interrupted before completing (finishedAt is the sweep " +
            "time, not the actual end)",
        },
      });
      return result.count;
    });

    if (finalized > 0) {
      log.info({ finalized }, "Marked stale ingestion runs as failed");
    }

    return { finalized };
  },
);
