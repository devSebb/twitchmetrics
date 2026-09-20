/**
 * Collapse re-sighted streams into one StreamSessionFact row each.
 *
 * Every StreamHatchet daily export carries a rolling 3-day window, so a stream
 * still live at the cut reappears in the next file with the same video id but a
 * slid begin/end. The old unique key included (streamBeginsAt, streamEndsAt),
 * so each copy inserted a new row: yt airtime +199%, watch time +109%, and
 * 14.65% of yt daily rollups claiming more than 24 h in one day.
 *
 * Merge rule (decision D10, "option A" — chosen after measuring that sightings
 * SLIDE rather than nest, and that no single sighting covers a 26-day stream):
 *   begins  = earliest, ends = latest
 *   airtime = the merged span (>= 1 minute)
 *   avgViewers = airtime-weighted mean of the sightings
 *   watch time = avgViewers × airtime
 *   peak = highest, with that sighting's timestamp
 *   descriptive columns = newest sighting (highest partitionDate)
 * The keeper row is the one with the most airtime; the rest are deleted.
 *
 * Run this BEFORE creating StreamSessionFact_stream_identity_key: the unique
 * index cannot be built while duplicates exist. Dry-run by default.
 *
 * Options:
 *   --platform yt|twitch|kick   (default yt — by far the worst affected)
 *   --write
 *   --group-batch 200           identity groups merged per transaction
 *   --limit-groups 0            stop after N groups (0 = all)
 *   --sleep-ms 0
 *
 * Usage: npx tsx --env-file=apps/web/.env.local workers/dedupe-stream-sessions.ts --platform yt --write
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const intArg = (name: string, fallback: number): number => {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const PLATFORM = argValue("--platform") ?? "yt";
const WRITE = args.includes("--write");
// Groups fetched per discovery scan. NOT a transaction size — each group is
// merged in its own transaction.
//
// The discovery query is a full GROUP BY over the platform's partition: 158
// SECONDS for yt (8M rows, 32 GB table) measured on prod 2026-09-20, and it
// re-runs for every batch. At the old default of 200 that capped throughput at
// ~77 groups/min no matter how fast the merges ran, and the 62,800-group run
// spent most of its 5h50m rescanning. Merging is ~57 groups/s, so a large
// batch amortises the scan: 5,000 groups costs one scan plus ~90 s of work.
const GROUP_BATCH = intArg("--group-batch", 5_000);
const LIMIT_GROUPS = intArg("--limit-groups", 0);
const SLEEP_MS = intArg("--sleep-ms", 0);
const SOURCE = "streamhatchet";
const MAX_SAMPLES = 5;

function log(level: "info" | "error", msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [dedupe-stream-sessions] ${msg}`;
  console[level](data === undefined ? line : `${line} ${JSON.stringify(data)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GroupKey = {
  platformUserId: string;
  videoId: string;
  beginsAt: Date | null;
};

/**
 * Identity groups with more than one row. Video-id platforms group on the
 * video id; kick (no video id) groups on its begin time, which was verified
 * not to slide.
 */
async function loadDuplicateGroups(
  take: number,
  skip: number,
): Promise<GroupKey[]> {
  const rows = await prisma.$queryRaw<
    { platformUserId: string; videoId: string; beginsAt: Date | null }[]
  >(Prisma.sql`
    SELECT "platformUserId",
           COALESCE("platformVideoId", '') AS "videoId",
           (CASE WHEN "platformVideoId" IS NULL THEN "streamBeginsAt" END) AS "beginsAt"
    FROM "StreamSessionFact"
    WHERE source = ${SOURCE} AND platform = ${PLATFORM}
    -- Positional GROUP BY: the selected expressions ARE the group key.
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
    ORDER BY 1, 2
    LIMIT ${take} OFFSET ${skip}
  `);
  return rows;
}

type FactRow = {
  id: string;
  platformUserId: string;
  platformVideoId: string | null;
  partitionDate: Date;
  streamBeginsAt: Date;
  streamEndsAt: Date;
  peakViewers: number;
  peakViewersAt: Date | null;
  airtimeMinutes: number;
  minutesWatched: bigint;
  averageViewers: number;
  allGameNames: string[];
  primaryGameName: string | null;
};

function mergeGroup(rows: FactRow[]) {
  const begins = new Date(
    Math.min(...rows.map((r) => r.streamBeginsAt.getTime())),
  );
  const ends = new Date(Math.max(...rows.map((r) => r.streamEndsAt.getTime())));
  const spanMinutes = Math.max(
    1,
    Math.round((ends.getTime() - begins.getTime()) / 60_000),
  );

  const weight = rows.reduce((sum, r) => sum + r.airtimeMinutes, 0);
  const averageViewers =
    weight > 0
      ? rows.reduce((sum, r) => sum + r.averageViewers * r.airtimeMinutes, 0) /
        weight
      : Math.max(...rows.map((r) => r.averageViewers));

  const peakRow = rows.reduce((best, r) =>
    r.peakViewers > best.peakViewers ? r : best,
  );
  const newest = rows.reduce((best, r) =>
    r.partitionDate.getTime() >= best.partitionDate.getTime() ? r : best,
  );
  // Keep the row that already represents the most of the stream.
  const keeper = rows.reduce((best, r) =>
    r.airtimeMinutes > best.airtimeMinutes ? r : best,
  );

  return {
    keeperId: keeper.id,
    deleteIds: rows.filter((r) => r.id !== keeper.id).map((r) => r.id),
    data: {
      streamBeginsAt: begins,
      streamEndsAt: ends,
      airtimeMinutes: spanMinutes,
      averageViewers,
      minutesWatched: BigInt(Math.round(averageViewers * spanMinutes)),
      peakViewers: peakRow.peakViewers,
      peakViewersAt: peakRow.peakViewersAt,
      partitionDate: newest.partitionDate,
      primaryGameName: newest.primaryGameName,
      allGameNames: [...new Set(rows.flatMap((r) => r.allGameNames))],
    },
  };
}

async function main() {
  log("info", "Start", {
    mode: WRITE ? "write" : "dry-run",
    platform: PLATFORM,
    groupBatch: GROUP_BATCH,
    limitGroups: LIMIT_GROUPS || null,
  });

  let groupsSeen = 0;
  let rowsMerged = 0;
  let rowsDeleted = 0;
  let airtimeBefore = 0;
  let airtimeAfter = 0;
  const samples: unknown[] = [];
  // In write mode merged groups stop matching HAVING count(*) > 1, so the
  // window always starts at 0; a dry-run has to page past what it inspected.
  let skip = 0;

  for (;;) {
    const take = LIMIT_GROUPS
      ? Math.min(GROUP_BATCH, LIMIT_GROUPS - groupsSeen)
      : GROUP_BATCH;
    if (take <= 0) break;

    const groups = await loadDuplicateGroups(take, skip);
    if (groups.length === 0) break;

    for (const group of groups) {
      const rows = await prisma.$queryRaw<FactRow[]>(Prisma.sql`
        SELECT id, "platformUserId", "platformVideoId", "partitionDate",
               "streamBeginsAt", "streamEndsAt", "peakViewers", "peakViewersAt",
               "airtimeMinutes", "minutesWatched", "averageViewers",
               "allGameNames", "primaryGameName"
        FROM "StreamSessionFact"
        WHERE source = ${SOURCE} AND platform = ${PLATFORM}
          AND "platformUserId" = ${group.platformUserId}
          AND COALESCE("platformVideoId", '') = ${group.videoId}
          ${
            group.beginsAt
              ? Prisma.sql`AND "streamBeginsAt" = ${group.beginsAt}`
              : Prisma.empty
          }
      `);
      if (rows.length < 2) continue;

      const merged = mergeGroup(rows);
      groupsSeen++;
      rowsMerged += rows.length;
      rowsDeleted += merged.deleteIds.length;
      airtimeBefore += rows.reduce((sum, r) => sum + r.airtimeMinutes, 0);
      airtimeAfter += merged.data.airtimeMinutes;

      if (samples.length < MAX_SAMPLES) {
        samples.push({
          platformUserId: group.platformUserId,
          videoId: group.videoId || null,
          sightings: rows.length,
          airtimeSum: rows.reduce((sum, r) => sum + r.airtimeMinutes, 0),
          airtimeMerged: merged.data.airtimeMinutes,
          spanHours: Math.round(merged.data.airtimeMinutes / 60),
        });
      }

      if (WRITE) {
        // DELETE FIRST, then update the keeper. The OLD unique index is still
        // in place while this runs — (source, platform, platformUserId,
        // COALESCE(videoId,''), streamBeginsAt, streamEndsAt) — and the
        // keeper's merged span is (earliest begin, latest end). When one of
        // the sightings already covers the full span (P1 measured 44 of 3,000
        // groups nesting rather than sliding), writing the keeper before that
        // sibling is gone collides with it. Prisma runs a $transaction array
        // in order, so the delete simply has to come first.
        await prisma.$transaction([
          prisma.streamSessionFact.deleteMany({
            where: { id: { in: merged.deleteIds } },
          }),
          prisma.streamSessionFact.update({
            where: { id: merged.keeperId },
            data: merged.data,
          }),
        ]);
      }
    }

    if (!WRITE) skip += groups.length;
    log("info", "Progress", {
      groupsSeen,
      rowsMerged,
      rowsDeleted,
      airtimeBefore,
      airtimeAfter,
    });
    if (SLEEP_MS > 0) await sleep(SLEEP_MS);
    if (groups.length < take) break;
  }

  log("info", WRITE ? "Complete" : "Dry-run complete", {
    platform: PLATFORM,
    groups: groupsSeen,
    rowsMerged,
    rowsDeleted,
    airtimeBefore,
    airtimeAfter,
    airtimeReductionPct:
      airtimeBefore > 0
        ? Number((100 - (airtimeAfter / airtimeBefore) * 100).toFixed(1))
        : 0,
    samples,
    ...(WRITE
      ? {}
      : { hint: "re-run with --write, then create the identity unique index" }),
  });
}

main()
  .catch((error) => {
    log("error", "fatal", {
      error:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
