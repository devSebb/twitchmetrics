import { inngest } from "../../client";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import {
  finalizeCreatorDailyRollups,
  finalizeStreamHatchetDailySessionRollups,
  formatPartitionDate,
  ingestStreamHatchetDailySessionObject,
  type StreamHatchetDailySessionImportResult,
  type StreamHatchetDailySessionPlatform,
} from "@/server/services/streamhatchet/daily-sessions";

type CronPlatformTarget = {
  platform: StreamHatchetDailySessionPlatform;
  matchedOnly: boolean;
};

type CronStepFailure = {
  platform: string;
  date: string;
  stage: "import" | "rollups" | "creator-rollups";
  error: string;
};

type StreamHatchetS3CronResult =
  | {
      disabled: true;
      scanned: number;
      written: number;
      skipped: number;
      failed: number;
    }
  | {
      disabled: false;
      dates: string[];
      targets: CronPlatformTarget[];
      results: StreamHatchetDailySessionImportResult[];
      failures: CronStepFailure[];
      summary: ReturnType<typeof summarizeResults>;
    };

// 4, not 3: a stream still live at the export cut is re-sighted the next day
// with a later end, and C26 attributes that extra time to the days it covers —
// so the earlier days must be recomputed once the stream's end moves.
const DEFAULT_RETRY_DAYS = 4;
// StreamHatchet is the primary catalog source: ingest ALL channels (full mode),
// not just ones already matched to a CreatorProfile. `yt` is the canonical
// YouTube creator feed; `ytg` (YouTube Gaming) is opt-in via env because of its
// ~10x row volume and is used for game-level data rather than the creator catalog.
// Ordered smallest-first so the heaviest platform (twitch) can never starve the
// others of run time (twitch failing daily silently froze yt for 3 weeks).
const BASE_TARGETS: CronPlatformTarget[] = [
  { platform: "kick", matchedOnly: false },
  { platform: "yt", matchedOnly: false },
  { platform: "twitch", matchedOnly: false },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePlatformTargets(): CronPlatformTarget[] {
  const raw = process.env.STREAMHATCHET_S3_CRON_PLATFORMS;
  const platforms = raw
    ? raw
        .split(",")
        .map((platform) => platform.trim())
        .filter(Boolean)
    : [
        ...BASE_TARGETS.map((target) => target.platform),
        ...(process.env.STREAMHATCHET_S3_CRON_INCLUDE_YTG === "true"
          ? ["ytg" as const]
          : []),
      ];

  const targets: CronPlatformTarget[] = [];
  for (const platform of platforms) {
    if (
      platform !== "kick" &&
      platform !== "twitch" &&
      platform !== "yt" &&
      platform !== "ytg"
    ) {
      continue;
    }

    targets.push({
      platform,
      matchedOnly: false,
    });
  }

  return targets;
}

function recentPartitionDates(retryDays: number): Date[] {
  const yesterdayUtc = new Date();
  yesterdayUtc.setUTCHours(0, 0, 0, 0);
  yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);

  return Array.from({ length: retryDays }, (_, index) => {
    const date = new Date(yesterdayUtc);
    date.setUTCDate(yesterdayUtc.getUTCDate() - index);
    return date;
  });
}

function summarizeResults(results: StreamHatchetDailySessionImportResult[]) {
  return results.reduce(
    (summary, result) => {
      summary.recordsScanned += result.scanned;
      summary.recordsWritten += result.written;
      // Re-sighted streams that merged into an existing fact row.
      summary.recordsUpdated += result.updated;
      summary.recordsSkipped += result.skipped;
      summary.recordsFailed += result.failed;
      summary.matched += result.matched;
      if (result.skippedExisting) summary.existingObjectsSkipped++;
      return summary;
    },
    {
      recordsScanned: 0,
      recordsWritten: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      matched: 0,
      existingObjectsSkipped: 0,
    },
  );
}

export const streamHatchetS3DailySessions = inngest.createFunction(
  {
    id: "streamhatchet-s3-daily-sessions",
    concurrency: { limit: 1 },
  },
  [{ cron: "10 8 * * *" }, { event: "streamhatchet/s3-daily-sessions" }],
  async ({ step }) => {
    return executeIngestionRun<StreamHatchetS3CronResult>(
      {
        domain: "platform",
        scope: "snapshot",
        jobType: "streamhatchet-s3-daily-sessions",
        platform: "streamhatchet",
      },
      async () => {
        if (process.env.STREAMHATCHET_S3_CRON_DISABLED === "true") {
          const result: StreamHatchetS3CronResult = {
            disabled: true,
            scanned: 0,
            written: 0,
            skipped: 0,
            failed: 0,
          };
          return {
            result,
            summary: {
              recordsSkipped: 1,
              metadata: { reason: "STREAMHATCHET_S3_CRON_DISABLED=true" },
            },
          };
        }

        const targets = parsePlatformTargets();
        const retryDays = parsePositiveInt(
          process.env.STREAMHATCHET_S3_CRON_RETRY_DAYS,
          DEFAULT_RETRY_DAYS,
        );
        const dates = recentPartitionDates(retryDays);
        const results: StreamHatchetDailySessionImportResult[] = [];
        const failures: CronStepFailure[] = [];

        // Each (platform, date) runs as two steps — facts import, then rollup
        // recompute — so each fits maxDuration. Failures are caught per pair:
        // one platform crashing must not abort the rest of the sweep.
        for (const date of dates) {
          const dateKey = formatPartitionDate(date);
          for (const target of targets) {
            let importResult: StreamHatchetDailySessionImportResult;
            try {
              importResult = (await step.run(
                `import-${target.platform}-${dateKey}`,
                () =>
                  ingestStreamHatchetDailySessionObject({
                    platform: target.platform,
                    date,
                    matchedOnly: target.matchedOnly,
                    force: false,
                    skipRollups: true,
                  }),
              )) as StreamHatchetDailySessionImportResult;
            } catch (error) {
              failures.push({
                platform: target.platform,
                date: dateKey,
                stage: "import",
                error: errorMessage(error),
              });
              continue;
            }
            results.push(importResult);

            // Rollups run even when the file was already imported: a
            // neighbouring day's import can extend a stream that overlaps
            // THIS day, and the day's totals then change without its own
            // file changing.
            try {
              await step.run(`rollups-${target.platform}-${dateKey}`, () =>
                finalizeStreamHatchetDailySessionRollups({
                  platform: target.platform,
                  date,
                  matchedOnly: target.matchedOnly,
                }),
              );
            } catch (error) {
              failures.push({
                platform: target.platform,
                date: dateKey,
                stage: "rollups",
                error: errorMessage(error),
              });
            }
          }

          // After every platform for this date: merge each creator's live
          // intervals across platforms so a simulcast counts once.
          try {
            await step.run(`creator-rollups-${dateKey}`, () =>
              finalizeCreatorDailyRollups({ date }),
            );
          } catch (error) {
            failures.push({
              platform: "all",
              date: dateKey,
              stage: "creator-rollups",
              error: errorMessage(error),
            });
          }
        }

        const summary = summarizeResults(results);

        return {
          result: {
            disabled: false,
            dates: dates.map(formatPartitionDate),
            targets,
            results,
            failures,
            summary,
          },
          summary: {
            recordsScanned: summary.recordsScanned,
            recordsWritten: summary.recordsWritten,
            recordsSkipped: summary.recordsSkipped,
            recordsFailed: summary.recordsFailed,
            partialCount: failures.length,
            metadata: {
              dates: dates.map(formatPartitionDate),
              targets,
              matchedExistingProfiles: summary.matched,
              existingObjectsSkipped: summary.existingObjectsSkipped,
              retryDays,
              ...(failures.length > 0 ? { failures } : {}),
            },
          },
        };
      },
      step,
    );
  },
);
