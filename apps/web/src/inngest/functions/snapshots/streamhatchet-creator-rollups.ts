/**
 * Daily CreatorDailyRollup sweep (C27), split out of the facts import.
 *
 * It used to be the last step of streamhatchet-s3-daily-sessions, after every
 * platform's channel rollups for a date. That made it the first casualty
 * whenever the import ran long: twitch's rollup step alone takes ~28 minutes,
 * and the sweeps for 2026-09-24 to 09-26 died before reaching it, leaving three
 * days with no creator rows at all. The read path then falls back to
 * ChannelDailyRollup, which double-counts simulcasts — the exact QA complaint
 * C27 exists to fix.
 *
 * As its own function it only needs the facts to be in place, not the import
 * sweep to survive, and a slow platform can no longer starve it. It is
 * idempotent: each date is rebuilt from StreamSessionFact, so a re-run costs
 * time and nothing else.
 *
 * NO CRON. A date takes ~4 min, right at the 300 s Vercel step cap; with twitch
 * retries loading Neon it ran 1 of 9 days from 2026-09-28 and left the rest
 * half-written. The daily sweep now runs on a GitHub runner right after the
 * twitch import (.github/workflows/sh-daily-sessions.yml). This function stays
 * for a manual `streamhatchet/creator-rollups` event.
 */
import { inngest } from "../../client";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import {
  finalizeCreatorDailyRollups,
  formatPartitionDate,
  recentPartitionDates,
} from "@/server/services/streamhatchet/daily-sessions";

type CreatorRollupDateResult = {
  date: string;
  creatorRollups: number;
};

type CreatorRollupFailure = {
  date: string;
  error: string;
};

type CreatorRollupSweepResult = {
  dates: string[];
  results: CreatorRollupDateResult[];
  failures: CreatorRollupFailure[];
};

// Matches the import's default window so every date it touches gets creator
// rows. C26 attributes a stream to each day it covers, so an earlier day's
// totals change when a later import extends the stream — those days have to be
// rebuilt too, not just yesterday.
const DEFAULT_RETRY_DAYS = 4;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * A sweep that failed on some dates ran, but did not do its job. Degraded
 * rather than failed: the dates that did rebuild are still correct.
 */
export function assessCreatorRollupHealth(input: {
  dates: string[];
  results: CreatorRollupDateResult[];
  failures: CreatorRollupFailure[];
}): { status: "completed" | "degraded"; errorSummary?: string } {
  const notes: string[] = [];

  if (input.failures.length > 0) {
    notes.push(
      `${input.failures.length}/${input.dates.length} date(s) failed: ${input.failures
        .map((failure) => failure.date)
        .join(", ")}`,
    );
  }

  // Every date in the window should produce rows; a day with none means the
  // facts never arrived, which is the import's problem but visible here first.
  const empty = input.results.filter((result) => result.creatorRollups === 0);
  if (empty.length > 0) {
    notes.push(
      `no creator rows for ${empty.map((result) => result.date).join(", ")}`,
    );
  }

  if (notes.length === 0) return { status: "completed" };
  return { status: "degraded", errorSummary: notes.join("; ").slice(0, 1000) };
}

export const streamHatchetCreatorRollups = inngest.createFunction(
  {
    id: "streamhatchet-creator-rollups",
    concurrency: { limit: 1 },
  },
  [{ event: "streamhatchet/creator-rollups" }],
  async ({ step }) => {
    return executeIngestionRun<CreatorRollupSweepResult>(
      {
        domain: "platform",
        scope: "snapshot",
        jobType: "streamhatchet-creator-rollups",
        platform: "streamhatchet",
      },
      async () => {
        const retryDays = parsePositiveInt(
          process.env.STREAMHATCHET_S3_CRON_RETRY_DAYS,
          DEFAULT_RETRY_DAYS,
        );
        const dates = recentPartitionDates(retryDays);
        const dateKeys = dates.map(formatPartitionDate);
        const results: CreatorRollupDateResult[] = [];
        const failures: CreatorRollupFailure[] = [];

        // One step per date: each fits the step budget on its own, and a date
        // that fails does not take the rest of the window with it.
        for (const date of dates) {
          const dateKey = formatPartitionDate(date);
          try {
            const result = (await step.run(`creator-rollups-${dateKey}`, () =>
              finalizeCreatorDailyRollups({ date }),
            )) as { creatorRollups: number };
            results.push({ date: dateKey, ...result });
          } catch (error) {
            failures.push({ date: dateKey, error: errorMessage(error) });
          }
        }

        const written = results.reduce(
          (sum, result) => sum + result.creatorRollups,
          0,
        );

        return {
          result: { dates: dateKeys, results, failures },
          summary: {
            ...assessCreatorRollupHealth({
              dates: dateKeys,
              results,
              failures,
            }),
            recordsWritten: written,
            partialCount: failures.length,
            metadata: {
              dates: dateKeys,
              retryDays,
              perDate: results,
              ...(failures.length > 0 ? { failures } : {}),
            },
          },
        };
      },
      step,
    );
  },
);
