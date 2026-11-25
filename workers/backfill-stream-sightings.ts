/**
 * Backfill StreamSessionFact.sightingsByDay from the daily export files.
 *
 * A stream that runs for weeks is ONE fact, merged from the sliding 3-day
 * window every daily export carries (packages/core/src/rollups/facts.ts). The
 * merge kept one all-time peak and one lifetime average, so the rollups put
 * both on every day: a 30-day peak could come from two months earlier (QA
 * 2026-11-24, Quiet Little Sanctuary 6,072 against Stream Hatchet BI's 1,142).
 * The import now keeps each export's own average and peak as it merges; this
 * worker fills the same field for the days imported before that, by reading
 * the export files again. It changes nothing else on the fact.
 *
 * Only facts longer than one export window are touched (~25K on YouTube, ~1K
 * on Twitch for a month). Re-running a day rewrites the same entries.
 *
 * Dry run by default: prints per day how many facts it would fill.
 * After a --write run, rebuild the rollups for the same range:
 *
 *   npx tsx workers/streamhatchet-ingest.ts --recompute-rollups --platform yt \
 *     --start-date A --end-date B --write
 *
 * Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/backfill-stream-sightings.ts --platform yt --days 35
 *   npx tsx --env-file=apps/web/.env.local workers/backfill-stream-sightings.ts \
 *     --platform yt --start-date 2026-10-20 --end-date 2026-11-23 --write
 *
 * Flags:
 *   --platform twitch|kick|yt       default yt
 *   --date D | --start-date A --end-date B | --days N (ending yesterday UTC)
 *   --write                         apply (default: dry run)
 *   --bucket / --prefix / --profile / --region   as streamhatchet-ingest.ts
 */

import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  SIGHTING_WINDOW_MINUTES,
  sightingEntry,
} from "@twitchmetrics/core/rollups";
import {
  buildDailySessionKey,
  downloadS3Object,
  parseDailySessionCsv,
  type DailySessionPlatform,
} from "./lib/streamhatchet-daily-sessions";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

const SOURCE = "streamhatchet";
const DAY_MS = 86_400_000;
const UPDATE_BATCH = 500;
const VALID_PLATFORMS = new Set<DailySessionPlatform>(["twitch", "kick", "yt"]);

function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}

function log(message: string, data?: Record<string, unknown>) {
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${new Date().toISOString()}] [sightings] ${message}${extra}`);
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date '${value}'. Use YYYY-MM-DD.`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveDates(): Date[] {
  const single = argValue("--date");
  const start = argValue("--start-date");
  const end = argValue("--end-date");
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  let from: Date;
  let to: Date;
  if (single) {
    from = to = parseDate(single);
  } else if (start && end) {
    from = parseDate(start);
    to = parseDate(end);
  } else {
    const days = Number.parseInt(argValue("--days") ?? "4", 10);
    if (!Number.isFinite(days) || days < 1) {
      throw new Error("--days must be a positive integer.");
    }
    to = yesterday;
    from = new Date(to.getTime() - (days - 1) * DAY_MS);
  }
  const dates: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    dates.push(new Date(t));
  }
  return dates;
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Server has closed the connection|Can't reach database server|Timed out fetching a new connection|connection pool|ECONNRESET|Response from the Engine was empty/i.test(
    message,
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt > 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function isMissingObject(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /NoSuchKey|\(404\)|Not Found/i.test(message);
}

type Entry = ReturnType<typeof sightingEntry>;

async function backfillDay(input: {
  platform: DailySessionPlatform;
  date: Date;
  bucket: string;
  prefix: string;
  profile: string;
  region: string | undefined;
  write: boolean;
}): Promise<{ longFacts: number; matched: number; written: number }> {
  const { platform, date } = input;
  const dayKey = formatDate(date);

  // Facts longer than one window whose life overlaps this export's 3 days.
  const windowStart = new Date(date.getTime() - 2 * DAY_MS);
  const windowEnd = new Date(date.getTime() + DAY_MS);
  const facts = await withRetry(() =>
    prisma.streamSessionFact.findMany({
      where: {
        source: SOURCE,
        platform,
        airtimeMinutes: { gt: SIGHTING_WINDOW_MINUTES },
        platformVideoId: { not: null },
        streamBeginsAt: { lt: windowEnd },
        streamEndsAt: { gt: windowStart },
      },
      select: { id: true, platformUserId: true, platformVideoId: true },
    }),
  );
  if (facts.length === 0) return { longFacts: 0, matched: 0, written: 0 };

  const factIdByStream = new Map<string, string>();
  for (const fact of facts) {
    factIdByStream.set(
      `${fact.platformUserId} ${fact.platformVideoId}`,
      fact.id,
    );
  }

  const key = buildDailySessionKey(input.prefix, date, platform);
  let filePath: string;
  try {
    filePath = await downloadS3Object(input.bucket, key, {
      profile: input.profile,
      ...(input.region ? { region: input.region } : {}),
    });
  } catch (error) {
    if (isMissingObject(error)) {
      log("Export file not found; day skipped", { platform, day: dayKey });
      return { longFacts: facts.length, matched: 0, written: 0 };
    }
    throw error;
  }

  // One export can list a stream twice (one row per category): keep the row
  // with the higher peak, as the import does.
  const entryByFactId = new Map<string, Entry>();
  try {
    await parseDailySessionCsv({
      filePath,
      platform,
      partitionDate: date,
      onSession: (session) => {
        if (!session.platformVideoId) return;
        const factId = factIdByStream.get(
          `${session.platformUserId} ${session.platformVideoId}`,
        );
        if (!factId) return;
        const existing = entryByFactId.get(factId);
        if (existing && existing[1] >= session.peakViewers) return;
        entryByFactId.set(
          factId,
          sightingEntry({
            averageViewers: session.averageViewers,
            peakViewers: session.peakViewers,
            peakViewersAt: session.peakViewersAt,
          }),
        );
      },
    });
  } finally {
    await rm(path.dirname(filePath), { recursive: true, force: true });
  }

  let written = 0;
  if (input.write) {
    const rows = [...entryByFactId.entries()];
    for (let i = 0; i < rows.length; i += UPDATE_BATCH) {
      const tuples = Prisma.join(
        rows
          .slice(i, i + UPDATE_BATCH)
          .map(
            ([id, entry]) =>
              Prisma.sql`(${id}::uuid, ${JSON.stringify(entry)}::jsonb)`,
          ),
      );
      // "updatedAt" is left alone: nothing the export said changed.
      written += await withRetry(() =>
        prisma.$executeRaw(Prisma.sql`
          UPDATE "StreamSessionFact" AS f
          SET "sightingsByDay" =
            COALESCE(f."sightingsByDay", '{}'::jsonb)
            || jsonb_build_object(${dayKey}::text, v.entry)
          FROM (VALUES ${tuples}) AS v(id, entry)
          WHERE f.id = v.id
        `),
      );
    }
  }

  return { longFacts: facts.length, matched: entryByFactId.size, written };
}

async function main() {
  const platform = (argValue("--platform") ?? "yt") as DailySessionPlatform;
  if (!VALID_PLATFORMS.has(platform)) {
    throw new Error(`Unsupported platform '${platform}'.`);
  }
  const dates = resolveDates();
  const write = args.includes("--write");
  const config = {
    platform,
    bucket:
      argValue("--bucket") ??
      process.env.STREAMHATCHET_S3_BUCKET ??
      "streamhatchet-aggregations",
    prefix:
      argValue("--prefix") ??
      process.env.STREAMHATCHET_S3_PREFIX ??
      "daily_sessions/summary",
    profile:
      argValue("--profile") ??
      process.env.STREAMHATCHET_AWS_PROFILE ??
      "streamhatchet-readonly",
    region: argValue("--region") ?? process.env.AWS_REGION,
    write,
  };

  log(write ? "Backfill (WRITE)" : "Backfill (dry run)", {
    platform,
    from: formatDate(dates[0]!),
    to: formatDate(dates[dates.length - 1]!),
  });

  const totals = { matched: 0, written: 0 };
  for (const date of dates) {
    const result = await backfillDay({ ...config, date });
    totals.matched += result.matched;
    totals.written += result.written;
    log("Day done", { day: formatDate(date), ...result });
  }
  log("Finished", { days: dates.length, ...totals, write });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
