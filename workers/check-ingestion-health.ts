/**
 * Health check for the Stream Hatchet daily-sessions pipeline.
 *
 * Twitch facts sat 20 % short from 2026-09-26 to 10-05 and the creator rollups
 * ran 1 day in 9, and nobody knew for twelve days: every import run hung in
 * `running`, so the "degraded" verdict at the end of a run was never reached.
 * This check does not depend on any run finishing. It looks at what is in the
 * database for the last N days and fails when something is missing.
 *
 * Read-only. Exits 1 on any failure, so the daily workflow goes red and GitHub
 * emails the last committer.
 *
 * Checks, per day in the window (yesterday back N-1 days):
 *   1. every kick/yt/twitch S3 file was imported to the end: source object
 *      `completed` with lastImportedAt set (a killed import never sets it);
 *   2. the NEWEST day's facts reach the file's row count. Only the newest day:
 *      a stream seen again in a later file moves to that file's partition, so
 *      older days legitimately shrink;
 *   3. ChannelDailyRollup per platform and CreatorDailyRollup per day are not
 *      far below the median of the two weeks before the window (a half-written
 *      rollup shows up as a round 56,000 instead of ~118,000);
 *   4. no streamhatchet-* IngestionRun has been `running` for over 6 hours.
 *
 * Options:
 *   --days N   window size, ending yesterday UTC (default 4)
 *
 * Usage: npx tsx --env-file=apps/web/.env.local workers/check-ingestion-health.ts
 */
import { prisma } from "@twitchmetrics/database";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DAYS = Number.parseInt(argValue("--days") ?? "4", 10) || 4;

const PLATFORMS = ["kick", "yt", "twitch"] as const;
const DATASET = "daily_sessions_summary";
const BASELINE_DAYS = 14;
// The newest file's facts vs its row count. Rows SH repeats for one stream
// (a category switch) collapse into one fact, so a few percent short is normal.
const MIN_NEWEST_FACT_SHARE = 0.9;
// A rollup day this far under the baseline median was cut short, not quiet.
// Weekday swing is ~±10 %; the half-written days of 2026-10 sat at 42-67 %.
const MIN_ROLLUP_SHARE = 0.75;
const STUCK_RUN_HOURS = 6;
const DAY_MS = 86_400_000;

function log(level: "info" | "error", msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [check-ingestion-health] ${msg}`;
  console[level](data === undefined ? line : `${line} ${JSON.stringify(data)}`);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

async function main() {
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const windowStart = new Date(yesterday.getTime() - (DAYS - 1) * DAY_MS);
  const baselineStart = new Date(
    windowStart.getTime() - BASELINE_DAYS * DAY_MS,
  );
  const windowDays = Array.from(
    { length: DAYS },
    (_, i) => new Date(windowStart.getTime() + i * DAY_MS),
  );

  const failures: string[] = [];

  // 1. Every file imported to the end.
  const objects = await prisma.streamHatchetSourceObject.findMany({
    where: {
      dataset: DATASET,
      platform: { in: [...PLATFORMS] },
      partitionDate: { gte: windowStart, lte: yesterday },
    },
    select: {
      platform: true,
      partitionDate: true,
      status: true,
      rowCount: true,
      lastImportedAt: true,
    },
  });
  const objectByKey = new Map(
    objects.map((o) => [`${o.platform} ${dayKey(o.partitionDate!)}`, o]),
  );
  for (const platform of PLATFORMS) {
    for (const day of windowDays) {
      const object = objectByKey.get(`${platform} ${dayKey(day)}`);
      if (!object) {
        failures.push(`${platform} ${dayKey(day)}: file never imported`);
      } else if (object.status !== "completed" || !object.lastImportedAt) {
        failures.push(
          `${platform} ${dayKey(day)}: import ${object.status}${object.lastImportedAt ? "" : ", never finished writing"}`,
        );
      }
    }
  }

  // 2. The newest day's facts reach the file.
  for (const platform of PLATFORMS) {
    const object = objectByKey.get(`${platform} ${dayKey(yesterday)}`);
    if (!object?.rowCount) continue; // already reported above
    const facts = await prisma.streamSessionFact.count({
      where: { platform, partitionDate: yesterday },
    });
    const share = facts / object.rowCount;
    log("info", "Newest-day facts", {
      platform,
      date: dayKey(yesterday),
      facts,
      fileRows: object.rowCount,
      share: Number(share.toFixed(3)),
    });
    if (share < MIN_NEWEST_FACT_SHARE) {
      failures.push(
        `${platform} ${dayKey(yesterday)}: ${facts} facts for ${object.rowCount} file rows (${Math.round(share * 100)}%)`,
      );
    }
  }

  // 3. Rollups not cut short.
  const channelRows = await prisma.$queryRaw<
    { platform: string; date: Date; n: bigint }[]
  >`
    SELECT platform, date, count(*) AS n
    FROM "ChannelDailyRollup"
    WHERE platform IN ('kick', 'yt', 'twitch')
      AND date >= ${baselineStart}::date AND date <= ${yesterday}::date
    GROUP BY platform, date`;
  const creatorRows = await prisma.$queryRaw<{ date: Date; n: bigint }[]>`
    SELECT date, count(*) AS n
    FROM "CreatorDailyRollup"
    WHERE date >= ${baselineStart}::date AND date <= ${yesterday}::date
    GROUP BY date`;

  const series: { label: string; counts: Map<string, number> }[] = [
    ...PLATFORMS.map((platform) => ({
      label: `ChannelDailyRollup ${platform}`,
      counts: new Map(
        channelRows
          .filter((r) => r.platform === platform)
          .map((r) => [dayKey(r.date), Number(r.n)]),
      ),
    })),
    {
      label: "CreatorDailyRollup",
      counts: new Map(creatorRows.map((r) => [dayKey(r.date), Number(r.n)])),
    },
  ];

  for (const { label, counts } of series) {
    const baseline = median(
      [...counts.entries()]
        .filter(([day]) => day < dayKey(windowStart))
        .map(([, n]) => n),
    );
    const window = windowDays.map((day) => ({
      date: dayKey(day),
      rows: counts.get(dayKey(day)) ?? 0,
    }));
    log("info", label, { baselineMedian: baseline, window });
    if (baseline === 0) continue; // no history to compare against
    for (const { date, rows } of window) {
      if (rows < baseline * MIN_ROLLUP_SHARE) {
        failures.push(`${label} ${date}: ${rows} rows vs ~${baseline} typical`);
      }
    }
  }

  // 4. Nothing hung.
  const stuck = await prisma.ingestionRun.findMany({
    where: {
      jobType: { startsWith: "streamhatchet" },
      status: "running",
      startedAt: { lt: new Date(Date.now() - STUCK_RUN_HOURS * 3_600_000) },
    },
    select: { jobType: true, startedAt: true },
    orderBy: { startedAt: "asc" },
  });
  for (const run of stuck) {
    failures.push(
      `${run.jobType} running since ${run.startedAt.toISOString()}`,
    );
  }

  if (failures.length === 0) {
    log("info", "OK — SH daily sessions healthy", {
      window: `${dayKey(windowStart)}..${dayKey(yesterday)}`,
    });
    return;
  }

  log("error", "SH daily sessions UNHEALTHY", { failures });
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
