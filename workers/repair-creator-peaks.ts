/**
 * One-off repair: replace the "estimated combined" peak stored on
 * CreatorDailyRollup with the best single-platform peak (QA 2026-11).
 *
 * buildCreatorRollups used to add the other platforms' averages to a
 * platform's peak (C28) and store that with peakPlatform = null. It now keeps
 * the highest single-platform peak (packages/core/src/rollups/creator.ts).
 * Rebuilding every creator day would take ~18 h, so this rewrites only the
 * peak of the rows that hold a combined figure: peakPlatform null on a day with
 * more than one platform. The new value is the same one the builder picks: the
 * highest peakViewers among the creator's facts live that day, and its platform.
 *
 * Run it AFTER the new builder is deployed and pushed; the daily job and the
 * Inngest rollup function would otherwise write combined peaks again.
 *
 * Dry run by default: per day, how many rows change, and a few examples.
 *
 * Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/repair-creator-peaks.ts
 *   npx tsx --env-file=apps/web/.env.local workers/repair-creator-peaks.ts --write
 */
import { Prisma, prisma } from "@twitchmetrics/database";

const WRITE = process.argv.includes("--write");
/** Same fact window as recomputeCreatorRollups (SCAN_MARGIN_DAYS). */
const SCAN_MARGIN_DAYS = 30;
const EXAMPLE_SLUGS = ["ibai", "xqc", "ishowspeed", "kaicenat"];

function log(msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [repair-creator-peaks] ${msg}`;
  console.log(
    data === undefined
      ? line
      : `${line} ${JSON.stringify(data, (_k, v: unknown) =>
          typeof v === "bigint" ? v.toString() : v,
        )}`,
  );
}

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /closed the connection|Connection terminated|ECONNRESET|timed out|Can't reach database|connection pool|P1001|P1017|P2024/i.test(
    msg,
  );
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= attempts) throw err;
      const wait = Math.min(30_000, 1_000 * 2 ** attempt);
      log(`retryable DB error, retry ${attempt} in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Combined rows of one day with the single-platform peak that replaces them. */
function bestPeakSql(day: string): Prisma.Sql {
  return Prisma.sql`
    SELECT r."creatorProfileId",
           r."peakViewers" AS "oldPeak",
           best.peak AS "newPeak",
           best.platform AS "newPlatform"
    FROM "CreatorDailyRollup" r
    CROSS JOIN LATERAL (
      SELECT f."peakViewers" AS peak,
             CASE f.platform
               WHEN 'twitch' THEN 'twitch'
               WHEN 'kick' THEN 'kick'
               WHEN 'yt' THEN 'youtube'
               WHEN 'ytg' THEN 'youtube'
             END AS platform
      FROM "StreamSessionFact" f
      WHERE f."creatorProfileId" = r."creatorProfileId"
        AND f.source = 'streamhatchet'
        AND f."partitionDate" BETWEEN ${day}::date - ${SCAN_MARGIN_DAYS}::int
                                  AND ${day}::date + ${SCAN_MARGIN_DAYS}::int
        AND f."streamBeginsAt" < ${day}::date + 1
        AND f."streamEndsAt" > ${day}::date
      ORDER BY f."peakViewers" DESC
      LIMIT 1
    ) best
    WHERE r.date = ${day}::date
      AND r."peakPlatform" IS NULL
      AND r."peakViewers" IS NOT NULL
      AND cardinality(r.platforms) > 1`;
}

type Change = {
  creatorProfileId: string;
  oldPeak: number;
  newPeak: number;
  newPlatform: string | null;
};

async function main() {
  log(`start mode=${WRITE ? "WRITE" : "dry-run"}`);

  const days = await withRetry(
    () =>
      prisma.$queryRaw<{ day: string; rows: bigint }[]>`
      SELECT date::text AS day, count(*) AS rows
      FROM "CreatorDailyRollup"
      WHERE "peakPlatform" IS NULL
        AND "peakViewers" IS NOT NULL
        AND cardinality(platforms) > 1
      GROUP BY date
      ORDER BY date DESC`,
  );
  log(`days with combined peaks: ${days.length}`, {
    rows: days.reduce((sum, d) => sum + Number(d.rows), 0),
  });

  const examples = await prisma.creatorProfile.findMany({
    where: { slug: { in: EXAMPLE_SLUGS } },
    select: { id: true, slug: true },
  });
  const exampleSlug = new Map(examples.map((e) => [e.id, e.slug]));

  let changed = 0;
  let higher = 0;
  let noFact = 0;
  for (const { day, rows } of days) {
    const started = Date.now();
    if (WRITE) {
      const n = await withRetry(async () => {
        const [, count] = await prisma.$transaction([
          prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = '10min'`),
          prisma.$executeRaw`
            UPDATE "CreatorDailyRollup" t
            SET "peakViewers" = c."newPeak",
                "peakPlatform" = c."newPlatform"::"Platform"
            FROM (${bestPeakSql(day)}) c
            WHERE t."creatorProfileId" = c."creatorProfileId"::uuid
              AND t.date = ${day}::date`,
        ]);
        return count;
      });
      changed += n;
      noFact += Number(rows) - n;
      log(`${day} updated`, {
        rows: Number(rows),
        updated: n,
        seconds: Math.round((Date.now() - started) / 1000),
      });
      continue;
    }

    const found = await withRetry(() =>
      prisma.$queryRaw<Change[]>(bestPeakSql(day)),
    );
    changed += found.length;
    noFact += Number(rows) - found.length;
    const up = found.filter((c) => c.newPeak > c.oldPeak);
    higher += up.length;
    log(`${day}`, {
      rows: Number(rows),
      wouldUpdate: found.length,
      newHigherThanOld: up.length,
      seconds: Math.round((Date.now() - started) / 1000),
      examples: found
        .filter((c) => exampleSlug.has(c.creatorProfileId))
        .map((c) => ({
          slug: exampleSlug.get(c.creatorProfileId),
          old: c.oldPeak,
          new: c.newPeak,
          platform: c.newPlatform,
        })),
    });
  }

  // newHigherThanOld should be 0: the combined estimate was always at or
  // above the best single platform. rowsWithoutFact keep their old value.
  log("done", {
    mode: WRITE ? "WRITE" : "dry-run",
    changed,
    newHigherThanOld: WRITE ? undefined : higher,
    rowsWithoutFact: noFact,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
