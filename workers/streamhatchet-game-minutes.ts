/**
 * Minutes per game for every stream, from Stream Hatchet's per-game file.
 *
 *   s3://streamhatchet-aggregations/daily_sessions_games/sessions_games/
 *     {twitch,kick,yt}/day/year=YYYY/month=MM/day=DD/YYYY-MM-DD.csv
 *
 * The daily sessions file (what streamhatchet-ingest.ts imports) lists which
 * games a stream had but not for how long, so the rollups split every stream
 * equally between its games — xQc's GTA V and Just Chatting 141 h each over
 * 30 days, where SH's per-game file has ~90 % GTA V. This worker reads that
 * file, matches its stretches to our StreamSessionFact rows and stores the
 * day's minutes per game on StreamSessionFact.gameMinutesByDay; buildRollups
 * then splits the day by them (packages/core/src/rollups/game-minutes.ts).
 * Only days where the file says more than "the stream's one game, the whole
 * time" are stored.
 *
 * SH writes a day's file at ~02:00 UTC the next day. A day whose file is not
 * there yet is skipped and picked up by the next run.
 *
 * Dry run by default: prints per day how many streams it would change.
 *
 * Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-game-minutes.ts --date 2026-11-08
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-game-minutes.ts --days 4 --write
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-game-minutes.ts \
 *     --platform twitch --start-date 2026-10-11 --end-date 2026-11-09 --write --rebuild-rollups
 *
 * Flags:
 *   --platform twitch|kick|yt|all   default all
 *   --date D | --start-date A --end-date B | --days N (N days ending yesterday UTC, default 4)
 *   --write              store the minutes (otherwise dry run)
 *   --rebuild-rollups    with --write: rebuild that day's per-game rollups
 *                        (GameDailyRollup, ChannelGameDailyRollup) when anything
 *                        changed. The daily job leaves this off and rebuilds
 *                        the whole window itself; backfills turn it on.
 *   --profile P          AWS CLI profile (default streamhatchet-readonly;
 *                        "" = credentials from the environment, as on GitHub)
 *   --local-dir DIR      read DIR/{platform}-YYYY-MM-DD.csv instead of S3
 *   --show-user ID       log what is stored for this channel id (checking)
 */
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma, Prisma } from "@twitchmetrics/database";
import {
  assignSegmentsToFacts,
  categoriesOf,
  gameMinutesAddNothing,
  recomputeRollups,
  utcDayKey,
  type GameMinutes,
  type GameSegment,
  type SegmentFact,
} from "@twitchmetrics/core/rollups";
import {
  downloadS3Object,
  headS3Object,
} from "./lib/streamhatchet-daily-sessions";

const SOURCE = "streamhatchet";
const BUCKET = "streamhatchet-aggregations";
const PREFIX = "daily_sessions_games/sessions_games";
const PLATFORMS = ["kick", "yt", "twitch"] as const;
type GamesPlatform = (typeof PLATFORMS)[number];
const DAY_MS = 24 * 60 * 60 * 1000;
/** Same scan margin as the rollup loader: a fact is filed near the days it covers. */
const SCAN_MARGIN_DAYS = 30;
const WRITE_BATCH = 500;

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const WRITE = args.includes("--write");
const REBUILD = args.includes("--rebuild-rollups");
const PROFILE = argValue("--profile") ?? "streamhatchet-readonly";
const LOCAL_DIR = argValue("--local-dir");
const SHOW_USER = argValue("--show-user");

function log(msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [sh-game-minutes] ${msg}`;
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
  return /Server has closed the connection|closed the connection|Connection terminated|Transaction already closed|ECONNRESET|timed out|Can't reach database|connection pool|Response from the Engine was empty|P1001|P1017|P2024/i.test(
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

function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`bad date ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

function datesFromArgs(): Date[] {
  const single = argValue("--date");
  if (single) return [parseDay(single)];
  const start = argValue("--start-date");
  const end = argValue("--end-date");
  if (start || end) {
    if (!start || !end) throw new Error("--start-date needs --end-date");
    const out: Date[] = [];
    for (
      let d = parseDay(start);
      d.getTime() <= parseDay(end).getTime();
      d = new Date(d.getTime() + DAY_MS)
    ) {
      out.push(d);
    }
    return out;
  }
  const days = Number.parseInt(argValue("--days") ?? "4", 10) || 4;
  const today = parseDay(new Date().toISOString().slice(0, 10));
  return Array.from(
    { length: days },
    (_, i) => new Date(today.getTime() - (days - i) * DAY_MS),
  );
}

function platformsFromArgs(): GamesPlatform[] {
  const value = argValue("--platform") ?? "all";
  if (value === "all") return [...PLATFORMS];
  if (!(PLATFORMS as readonly string[]).includes(value)) {
    throw new Error(`--platform must be one of ${PLATFORMS.join(", ")}, all`);
  }
  return [value as GamesPlatform];
}

function fileKey(platform: GamesPlatform, day: Date): string {
  const key = utcDayKey(day);
  const [y, m, d] = key.split("-");
  return `${PREFIX}/${platform}/day/year=${y}/month=${m}/day=${d}/${key}.csv`;
}

/** One CSV record; game names can hold commas ("Warhammer 40,000: …"). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** Lines split on "\n" only (node:readline also splits on U+2028/2029). */
async function* readLines(file: string): AsyncGenerator<string> {
  let rest = "";
  for await (const chunk of createReadStream(file, { encoding: "utf8" })) {
    const parts = (rest + (chunk as string)).split("\n");
    rest = parts.pop() ?? "";
    for (const part of parts)
      yield part.endsWith("\r") ? part.slice(0, -1) : part;
  }
  if (rest) yield rest;
}

/** The file's stretches for the channels we hold facts for. */
async function readSegments(
  file: string,
  users: Set<string>,
): Promise<{ segments: GameSegment[]; rows: number }> {
  const segments: GameSegment[] = [];
  let rows = 0;
  let header: string[] | null = null;
  let col = { user: 0, begins: 1, ends: 2, game: 3, video: 5 };
  for await (const line of readLines(file)) {
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields;
      const at = (name: string) => {
        const i = fields.indexOf(name);
        if (i < 0) throw new Error(`per-game file has no ${name} column`);
        return i;
      };
      col = {
        user: at("user_id"),
        begins: at("stream_begins"),
        ends: at("stream_ends"),
        game: at("game"),
        video: at("video_id"),
      };
      continue;
    }
    rows += 1;
    const userId = fields[col.user] ?? "";
    if (!users.has(userId)) continue;
    const begins = Number(fields[col.begins]);
    const ends = Number(fields[col.ends]);
    if (!Number.isFinite(begins) || !Number.isFinite(ends) || ends <= begins) {
      continue;
    }
    segments.push({
      userId,
      videoId: fields[col.video] || null,
      beginsAt: begins * 1000,
      endsAt: ends * 1000,
      game: fields[col.game] ?? "",
    });
  }
  return { segments, rows };
}

/** Stable comparison of two stored day entries. */
function sameMinutes(a: GameMinutes | null, b: GameMinutes | null): boolean {
  if (!a || !b) return a === b;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return (
    ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
  );
}

function storedDay(value: unknown, day: string): GameMinutes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = (value as Record<string, unknown>)[day];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return entry as GameMinutes;
}

type Totals = {
  days: number;
  missingFiles: number;
  changed: number;
  rollupDays: number;
};

async function processDay(
  platform: GamesPlatform,
  day: Date,
  totals: Totals,
): Promise<void> {
  const dayKey = utcDayKey(day);
  const key = fileKey(platform, day);
  const started = Date.now();

  let file: string;
  let cleanup: string | null = null;
  if (LOCAL_DIR) {
    file = path.join(LOCAL_DIR, `${platform}-${dayKey}.csv`);
  } else {
    try {
      await headS3Object(BUCKET, key, { profile: PROFILE });
    } catch (err) {
      // Only a missing file is "not yet"; bad credentials must fail loudly.
      const message = err instanceof Error ? err.message : String(err);
      if (!/\(404\)|Not Found|NoSuchKey/.test(message)) throw err;
      log(`${platform} ${dayKey}: per-game file not published yet, skipped`, {
        key,
      });
      totals.missingFiles += 1;
      return;
    }
    file = await downloadS3Object(BUCKET, key, { profile: PROFILE });
    cleanup = path.dirname(file);
  }

  try {
    const dayEnd = new Date(day.getTime() + DAY_MS);
    const facts = await withRetry(() =>
      prisma.streamSessionFact.findMany({
        where: {
          source: SOURCE,
          platform,
          partitionDate: {
            gte: new Date(day.getTime() - SCAN_MARGIN_DAYS * DAY_MS),
            lte: new Date(day.getTime() + SCAN_MARGIN_DAYS * DAY_MS),
          },
          streamBeginsAt: { lt: dayEnd },
          streamEndsAt: { gt: day },
        },
        select: {
          id: true,
          platformUserId: true,
          platformVideoId: true,
          streamBeginsAt: true,
          streamEndsAt: true,
          primaryGameName: true,
          allGameNames: true,
          gameMinutesByDay: true,
        },
      }),
    );

    const users = new Set(facts.map((f) => f.platformUserId));
    const { segments, rows } = await readSegments(file, users);
    const { byFact, unmatchedSegments } = assignSegmentsToFacts(
      facts as SegmentFact[],
      segments,
      day,
    );

    const updates: { id: string; minutes: GameMinutes | null }[] = [];
    let stored = 0;
    let noMinutes = 0;
    for (const fact of facts) {
      const found = byFact.get(fact.id) ?? null;
      if (!found) noMinutes += 1;
      const wanted =
        found && !gameMinutesAddNothing(categoriesOf(fact), found)
          ? found
          : null;
      if (wanted) stored += 1;
      const current = storedDay(fact.gameMinutesByDay, dayKey);
      if (!sameMinutes(current, wanted)) {
        updates.push({ id: fact.id, minutes: wanted });
      }
      if (SHOW_USER && fact.platformUserId === SHOW_USER) {
        log(`${platform} ${dayKey}: ${SHOW_USER}`, {
          factId: fact.id,
          begins: fact.streamBeginsAt,
          categories: categoriesOf(fact),
          fromFile: found,
          stored: wanted,
        });
      }
    }

    if (WRITE) {
      for (let i = 0; i < updates.length; i += WRITE_BATCH) {
        const batch = updates.slice(i, i + WRITE_BATCH);
        const values = Prisma.join(
          batch.map(
            (u) =>
              Prisma.sql`(${u.id}::uuid, ${
                u.minutes ? JSON.stringify(u.minutes) : null
              }::jsonb)`,
          ),
        );
        // Set or drop only this day's key; the other days stay as they are.
        await withRetry(
          () =>
            prisma.$executeRaw`
            UPDATE "StreamSessionFact" f
            SET "gameMinutesByDay" = CASE
              WHEN v.minutes IS NULL
                THEN NULLIF(COALESCE(f."gameMinutesByDay", '{}'::jsonb) - ${dayKey}::text, '{}'::jsonb)
              ELSE COALESCE(f."gameMinutesByDay", '{}'::jsonb) || jsonb_build_object(${dayKey}::text, v.minutes)
            END
            FROM (VALUES ${values}) AS v(id, minutes)
            WHERE f.id = v.id
          `,
        );
      }
    }

    let rebuilt = false;
    if (WRITE && REBUILD && updates.length > 0) {
      await recomputeRollups(prisma, {
        source: SOURCE,
        platform,
        partitionDate: day,
        matchedOnly: false,
        retry: withRetry,
        skipDuplicates: true,
        gamesOnly: true,
      });
      rebuilt = true;
      totals.rollupDays += 1;
    }

    totals.days += 1;
    totals.changed += updates.length;
    log(`${platform} ${dayKey}${WRITE ? "" : " (dry run)"}`, {
      fileRows: rows,
      rowsForOurChannels: segments.length,
      rowsWithNoStreamOfOurs: unmatchedSegments,
      facts: facts.length,
      factsWithoutFileRows: noMinutes,
      factsStored: stored,
      changed: updates.length,
      set: updates.filter((u) => u.minutes).length,
      removed: updates.filter((u) => !u.minutes).length,
      rollupsRebuilt: rebuilt,
      seconds: Math.round((Date.now() - started) / 1000),
    });
  } finally {
    if (cleanup) await rm(cleanup, { recursive: true, force: true });
  }
}

async function main() {
  const platforms = platformsFromArgs();
  const dates = datesFromArgs();
  log(`start ${WRITE ? "WRITE" : "dry run"}`, {
    platforms,
    from: utcDayKey(dates[0]!),
    to: utcDayKey(dates[dates.length - 1]!),
    days: dates.length,
    rebuildRollups: WRITE && REBUILD,
  });
  const totals: Totals = {
    days: 0,
    missingFiles: 0,
    changed: 0,
    rollupDays: 0,
  };
  // Newest first: if a long backfill stops, the days the site shows are done.
  for (const day of [...dates].reverse()) {
    for (const platform of platforms) {
      await processDay(platform, day, totals);
    }
  }
  log("done", totals);
  if (!WRITE) log("dry run — nothing written. Re-run with --write to apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
