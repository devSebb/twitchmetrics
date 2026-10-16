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
 * Two kinds of finding, kept apart so a red run says whose problem it is:
 *
 *   PIPELINE — we dropped data we were sent. Always a failure.
 *     1. every kick/yt/twitch S3 file was imported to the end: source object
 *        `completed` with lastImportedAt set (a killed import never sets it);
 *     2. the NEWEST day's facts reach the file's row count. Only the newest
 *        day: a stream seen again in a later file moves to that file's
 *        partition, so older days legitimately shrink;
 *     3. ChannelDailyRollup and CreatorDailyRollup hold at least every channel
 *        / creator that has a fact filed under that day and overlapping it. The
 *        rollup also picks up streams filed under neighbouring days, so this is
 *        a floor, not an exact count — but a half-written rollup (twitch, 2026-10:
 *        24k rows for 80k channels) always lands under it;
 *     4. no streamhatchet-* IngestionRun has been `running` for over 6 hours.
 *
 *   SOURCE — Stream Hatchet sent less than usual. Nothing here can fix it; the
 *   fix is asking them. A file's row count is compared with the median of the
 *   same platform's files in the two weeks before the window:
 *     - under 50 %: failure. A truncated export (twitch 2026-10-02..06 arrived
 *       at ~15k rows instead of ~85k) — don't --force re-import it;
 *     - under 80 %: warning only. A real but smaller shift (the yt export
 *       dropped from ~31k to ~25k channels a day on 2026-10-07) should be
 *       visible, not turn every run red until the baseline catches up.
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
const SOURCE = "streamhatchet";
const BASELINE_DAYS = 14;
// The newest file's facts vs its row count. Rows SH repeats for one stream
// (a category switch) collapse into one fact, so a few percent short is normal.
const MIN_NEWEST_FACT_SHARE = 0.9;
// A file's rows vs the median of recent files. Weekday swing is ~±10 %.
const SOURCE_FAIL_SHARE = 0.5;
const SOURCE_WARN_SHARE = 0.8;
const STUCK_RUN_HOURS = 6;
const DAY_MS = 86_400_000;

function log(level: "info" | "error", msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [check-ingestion-health] ${msg}`;
  console[level](data === undefined ? line : `${line} ${JSON.stringify(data)}`);
}

// On a GitHub runner these lines become annotations on the run's summary page,
// so the email's link shows the finding without opening the log.
function annotate(level: "error" | "warning", message: string) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level}::${message}`);
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
  const sourceFailures: string[] = [];
  const sourceWarnings: string[] = [];

  // 1. Every file imported to the end. Baseline files are loaded too, for the
  // source check at the end.
  const allObjects = await prisma.streamHatchetSourceObject.findMany({
    where: {
      dataset: DATASET,
      platform: { in: [...PLATFORMS] },
      partitionDate: { gte: baselineStart, lte: yesterday },
    },
    select: {
      platform: true,
      partitionDate: true,
      status: true,
      rowCount: true,
      lastImportedAt: true,
    },
  });
  const objects = allObjects.filter((o) => o.partitionDate! >= windowStart);
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

  // 3. Rollups hold every channel / creator filed under their day. Same
  // overlap rule as the rollup builder: the stream has minutes inside the day.
  const channelFloor = await prisma.$queryRaw<
    { platform: string; date: Date; n: bigint }[]
  >`
    SELECT platform, "partitionDate" AS date, count(DISTINCT "platformUserId") AS n
    FROM "StreamSessionFact"
    WHERE source = ${SOURCE}
      AND platform IN ('kick', 'yt', 'twitch')
      AND "partitionDate" >= ${windowStart}::date
      AND "partitionDate" <= ${yesterday}::date
      AND "streamBeginsAt" < "partitionDate" + interval '1 day'
      AND "streamEndsAt" > "partitionDate"
      AND "streamEndsAt" > "streamBeginsAt"
    GROUP BY platform, "partitionDate"`;
  const channelRows = await prisma.$queryRaw<
    { platform: string; date: Date; n: bigint }[]
  >`
    SELECT platform, date, count(*) AS n
    FROM "ChannelDailyRollup"
    WHERE source = ${SOURCE}
      AND platform IN ('kick', 'yt', 'twitch')
      AND date >= ${windowStart}::date AND date <= ${yesterday}::date
    GROUP BY platform, date`;
  const creatorFloor = await prisma.$queryRaw<{ date: Date; n: bigint }[]>`
    SELECT "partitionDate" AS date, count(DISTINCT "creatorProfileId") AS n
    FROM "StreamSessionFact"
    WHERE source = ${SOURCE}
      AND "creatorProfileId" IS NOT NULL
      AND "partitionDate" >= ${windowStart}::date
      AND "partitionDate" <= ${yesterday}::date
      AND "streamBeginsAt" < "partitionDate" + interval '1 day'
      AND "streamEndsAt" > "partitionDate"
      AND "streamEndsAt" > "streamBeginsAt"
    GROUP BY "partitionDate"`;
  const creatorRows = await prisma.$queryRaw<{ date: Date; n: bigint }[]>`
    SELECT date, count(*) AS n
    FROM "CreatorDailyRollup"
    WHERE date >= ${windowStart}::date AND date <= ${yesterday}::date
    GROUP BY date`;

  const countsBy = (
    rows: { platform?: string; date: Date; n: bigint }[],
    platform?: string,
  ) =>
    new Map(
      rows
        .filter((r) => platform === undefined || r.platform === platform)
        .map((r) => [dayKey(r.date), Number(r.n)]),
    );
  const series = [
    ...PLATFORMS.map((platform) => ({
      label: `ChannelDailyRollup ${platform}`,
      rows: countsBy(channelRows, platform),
      floor: countsBy(channelFloor, platform),
    })),
    {
      label: "CreatorDailyRollup",
      rows: countsBy(creatorRows),
      floor: countsBy(creatorFloor),
    },
  ];
  for (const { label, rows, floor } of series) {
    const window = windowDays.map((day) => ({
      date: dayKey(day),
      rows: rows.get(dayKey(day)) ?? 0,
      atLeast: floor.get(dayKey(day)) ?? 0,
    }));
    log("info", label, { window });
    for (const { date, rows: n, atLeast } of window) {
      if (n < atLeast) {
        failures.push(
          `${label} ${date}: ${n} rows, but ${atLeast} have facts that day (rollup cut short)`,
        );
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

  // 5. Source: did SH send a normal-sized file?
  for (const platform of PLATFORMS) {
    const baseline = median(
      allObjects
        .filter(
          (o) =>
            o.platform === platform &&
            o.partitionDate! < windowStart &&
            o.rowCount != null,
        )
        .map((o) => o.rowCount!),
    );
    if (baseline === 0) continue; // no history to compare against
    for (const day of windowDays) {
      const rowCount = objectByKey.get(`${platform} ${dayKey(day)}`)?.rowCount;
      if (rowCount == null) continue; // reported by check 1
      const share = rowCount / baseline;
      const finding = `${platform} ${dayKey(day)}: SH file has ${rowCount} rows vs ~${baseline} typical (${Math.round(share * 100)}%)`;
      if (share < SOURCE_FAIL_SHARE) sourceFailures.push(finding);
      else if (share < SOURCE_WARN_SHARE) sourceWarnings.push(finding);
    }
  }

  for (const warning of sourceWarnings)
    annotate("warning", `SOURCE ${warning}`);
  if (sourceWarnings.length > 0) {
    log("info", "SOURCE warnings — Stream Hatchet sent less than usual", {
      warnings: sourceWarnings,
    });
  }

  if (failures.length === 0 && sourceFailures.length === 0) {
    log("info", "OK — SH daily sessions healthy", {
      window: `${dayKey(windowStart)}..${dayKey(yesterday)}`,
    });
    return;
  }

  for (const failure of failures) annotate("error", `PIPELINE ${failure}`);
  for (const failure of sourceFailures) annotate("error", `SOURCE ${failure}`);
  log("error", "SH daily sessions UNHEALTHY", {
    pipeline: failures,
    source: sourceFailures,
  });
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
