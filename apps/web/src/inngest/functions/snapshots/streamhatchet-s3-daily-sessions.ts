import { inngest } from "../../client";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import {
  formatPartitionDate,
  ingestStreamHatchetDailySessionObject,
  type StreamHatchetDailySessionImportResult,
  type StreamHatchetDailySessionPlatform,
} from "@/server/services/streamhatchet/daily-sessions";

type CronPlatformTarget = {
  platform: StreamHatchetDailySessionPlatform;
  matchedOnly: boolean;
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
      summary: ReturnType<typeof summarizeResults>;
    };

const DEFAULT_RETRY_DAYS = 3;
const BASE_TARGETS: CronPlatformTarget[] = [
  { platform: "kick", matchedOnly: false },
  { platform: "twitch", matchedOnly: true },
  { platform: "yt", matchedOnly: true },
];

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
      matchedOnly: platform !== "kick",
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
      summary.recordsSkipped += result.skipped;
      summary.recordsFailed += result.failed;
      summary.matched += result.matched;
      if (result.skippedExisting) summary.existingObjectsSkipped++;
      return summary;
    },
    {
      recordsScanned: 0,
      recordsWritten: 0,
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

        for (const date of dates) {
          for (const target of targets) {
            const result = (await step.run(
              `import-${target.platform}-${formatPartitionDate(date)}`,
              () =>
                ingestStreamHatchetDailySessionObject({
                  platform: target.platform,
                  date,
                  matchedOnly: target.matchedOnly,
                  force: false,
                }),
            )) as StreamHatchetDailySessionImportResult;
            results.push(result);
          }
        }

        const summary = summarizeResults(results);

        return {
          result: {
            disabled: false,
            dates: dates.map(formatPartitionDate),
            targets,
            results,
            summary,
          },
          summary: {
            recordsScanned: summary.recordsScanned,
            recordsWritten: summary.recordsWritten,
            recordsSkipped: summary.recordsSkipped,
            recordsFailed: summary.recordsFailed,
            metadata: {
              dates: dates.map(formatPartitionDate),
              targets,
              matchedExistingProfiles: summary.matched,
              existingObjectsSkipped: summary.existingObjectsSkipped,
              retryDays,
            },
          },
        };
      },
      step,
    );
  },
);
