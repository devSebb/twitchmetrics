/**
 * Stream Hatchet's own daily aggregates.
 *
 *   s3://streamhatchet-aggregations/channels/{twitch_helix,yt,kick}/profile_game/day/year=YYYY/month=MM/day=DD/
 *     one row per channel per game per UTC day, with the viewers minute by
 *     minute. Twitch: ~30 Parquet files. YouTube, Kick: one CSV.
 *   s3://streamhatchet-aggregations/games/{twitch,yt,kick}/viewership/year=YYYY/month=MM/day=DD/YYYY-MM-DD.csv
 *     one row per game: viewers and live channels minute by minute.
 *
 * The sessions file (streamhatchet-ingest.ts) leaves out most small channels,
 * so game totals built from it ran 10-25 % under Stream Hatchet BI, and a
 * game's peak was its biggest channel's peak. These files are what BI itself
 * shows (Stream Hatchet review, 2026-11-25; access 2026-11-26).
 *
 * Written to their own tables (ShChannelGameDaily, ShChannelDaily,
 * ShGameDaily, ShGameMinuteSeries). Channel rows are kept only for channels
 * we hold a profile for; game totals come from the game file and so count
 * every channel.
 *
 * DuckDB reads the day straight from S3 and does the arithmetic; Node only
 * writes the result. A (platform, day) is imported once; it is imported
 * again when Stream Hatchet replaces a file (the ETags change).
 *
 * The files land at about 00:30 UTC (channels) and 03:10 UTC (games) for the
 * day just ended. A day whose files are not both there is skipped and picked
 * up by the next run.
 *
 * Dry run by default: prints the day's totals and writes nothing.
 *
 * Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-profile-game.ts --date 2026-11-24
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-profile-game.ts --days 3 --write
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-profile-game.ts \
 *     --platform twitch --start-date 2026-08-28 --end-date 2026-11-25 --write
 *
 * Flags:
 *   --platform twitch|kick|yt|all   default all
 *   --date D | --start-date A --end-date B | --days N (N days ending yesterday UTC, default 3)
 *   --write              store the day (otherwise dry run)
 *   --force              import again although the files have not changed
 *   --series-days N      keep the per-minute game series only for days within
 *                        N days of today (default 30)
 *   --profile P          AWS CLI profile (default streamhatchet-readonly;
 *                        "" = credentials from the environment, as on GitHub)
 *   --work-dir DIR       scratch directory (default /tmp/sh-profile-game)
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { canonicalProfileId } from "../apps/web/src/server/services/identity/canonical-profile";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

const BUCKET = "streamhatchet-aggregations";
const DATASET = "profile_game";
type ShPlatform = "twitch" | "kick" | "yt";
const ALL_PLATFORMS: ShPlatform[] = ["twitch", "kick", "yt"];
/** Folder of the channel files, per platform. */
const CHANNEL_FOLDER: Record<ShPlatform, string> = {
  twitch: "twitch_helix",
  kick: "kick",
  yt: "yt",
};
/** PlatformAccount.platform for each Stream Hatchet platform name. */
const OUR_PLATFORM: Record<ShPlatform, "twitch" | "kick" | "youtube"> = {
  twitch: "twitch",
  kick: "kick",
  yt: "youtube",
};
/** A game keeps its per-minute series when it averaged this many viewers. */
const SERIES_MIN_MINUTES_WATCHED = 10 * 1440;
const INSERT_BATCH = 2000;
const DB_MAX_RETRIES = 5;

function argValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function log(message: string, data?: Record<string, unknown>) {
  console.log(
    `[${new Date().toISOString()}] [sh-profile-game] ${message}${
      data ? ` ${JSON.stringify(data)}` : ""
    }`,
  );
}

const write = args.includes("--write");
const force = args.includes("--force");
const awsProfile = argValue("--profile") ?? "streamhatchet-readonly";
const workDir = argValue("--work-dir") ?? "/tmp/sh-profile-game";
const seriesDays = Number.parseInt(argValue("--series-days") ?? "30", 10);

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string, flag: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`${flag} must be YYYY-MM-DD, got "${value}"`);
  return new Date(`${value}T00:00:00Z`);
}

function resolveDates(): string[] {
  const single = argValue("--date");
  if (single) return [isoDay(parseDay(single, "--date"))];
  const start = argValue("--start-date");
  const end = argValue("--end-date");
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  let from: Date;
  let to: Date;
  if (start || end) {
    if (!start || !end)
      throw new Error("--start-date and --end-date go together");
    from = parseDay(start, "--start-date");
    to = parseDay(end, "--end-date");
  } else {
    const days = Math.max(1, Number.parseInt(argValue("--days") ?? "3", 10));
    to = yesterday;
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));
  }
  const dates: string[] = [];
  for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1))
    dates.push(isoDay(d));
  return dates;
}

function resolvePlatforms(): ShPlatform[] {
  const value = argValue("--platform") ?? "all";
  if (value === "all") return ALL_PLATFORMS;
  if (!ALL_PLATFORMS.includes(value as ShPlatform))
    throw new Error(`--platform must be twitch, kick, yt or all`);
  return [value as ShPlatform];
}

// ─── S3 ──────────────────────────────────────────────────────────────────────

function awsEnv(): NodeJS.ProcessEnv {
  return awsProfile ? { ...process.env, AWS_PROFILE: awsProfile } : process.env;
}

type S3Object = { key: string; etag: string; size: number };

function listObjects(prefix: string): S3Object[] {
  const out = execFileSync(
    "aws",
    [
      "s3api",
      "list-objects-v2",
      "--bucket",
      BUCKET,
      "--prefix",
      prefix,
      "--query",
      "Contents[].{key:Key,etag:ETag,size:Size}",
      "--output",
      "json",
    ],
    { encoding: "utf8", env: awsEnv(), maxBuffer: 16 * 1024 * 1024 },
  ).trim();
  const parsed = out && out !== "null" ? (JSON.parse(out) as S3Object[]) : [];
  return parsed.filter((o) => o.size > 0);
}

function dayPath(date: string): string {
  const [y, m, d] = date.split("-");
  return `year=${y}/month=${m}/day=${d}/`;
}

const channelPrefix = (platform: ShPlatform, date: string) =>
  `channels/${CHANNEL_FOLDER[platform]}/profile_game/day/${dayPath(date)}`;
const gamePrefix = (platform: ShPlatform, date: string) =>
  `games/${platform}/viewership/${dayPath(date)}`;

// ─── Our accounts ────────────────────────────────────────────────────────────

/** user_id,creator_profile_id of every account we hold on the platform. */
async function exportAccounts(platform: ShPlatform): Promise<string> {
  const path = `${workDir}/accounts-${platform}.csv`;
  const lines = ["user_id,creator_profile_id"];
  let cursor: string | null = null;
  for (;;) {
    const rows: {
      id: string;
      platformUserId: string;
      creatorProfile: { id: string; mergedIntoId: string | null };
    }[] = await prisma.platformAccount.findMany({
      where: { platform: OUR_PLATFORM[platform] },
      select: {
        id: true,
        platformUserId: true,
        creatorProfile: { select: { id: true, mergedIntoId: true } },
      },
      orderBy: { id: "asc" },
      take: 50_000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const uid = /[",\n]/.test(r.platformUserId)
        ? `"${r.platformUserId.replace(/"/g, '""')}"`
        : r.platformUserId;
      lines.push(`${uid},${canonicalProfileId(r.creatorProfile)}`);
    }
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < 50_000) break;
  }
  writeFileSync(path, lines.join("\n"));
  log("Exported our accounts", { platform, accounts: lines.length - 1 });
  return path;
}

// ─── DuckDB ──────────────────────────────────────────────────────────────────

function duckdb(sql: string): string {
  return execFileSync("duckdb", ["-noheader", "-list", "-c", sql], {
    encoding: "utf8",
    env: awsEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * The channel file as one relation with the same columns on every platform.
 * Twitch is Parquet and typed; the CSVs carry their arrays as JSON text.
 */
function channelSource(platform: ShPlatform, date: string): string {
  const glob = `s3://${BUCKET}/${channelPrefix(platform, date)}*`;
  if (platform === "twitch") {
    return `SELECT CAST(user_id AS VARCHAR) AS user_id, game, CAST(game_id AS VARCHAR) AS game_id,
        display_name, username, CAST(NULL AS VARCHAR) AS logo,
        CAST(end_followers AS BIGINT) AS followers,
        game_airtime_minutes, game_minutes_watched, game_max_viewers,
        viewership, languages, game_genres
      FROM read_parquet('${glob}')`;
  }
  const types = `types={'user_id':'VARCHAR','game':'VARCHAR','game_id':'VARCHAR','display_name':'VARCHAR','viewership':'VARCHAR','game_genres':'VARCHAR'}`;
  const csv = `read_csv('${glob}', header=true, ${types})`;
  const genres = `COALESCE(TRY_CAST(json(game_genres) AS VARCHAR[]), CAST([] AS VARCHAR[]))`;
  if (platform === "yt") {
    return `SELECT user_id, game, game_id, display_name, CAST(NULL AS VARCHAR) AS username,
        CAST(logo AS VARCHAR) AS logo, TRY_CAST(subs AS BIGINT) AS followers,
        CAST(game_airtime_minutes AS BIGINT) AS game_airtime_minutes,
        CAST(game_minutes_watched AS BIGINT) AS game_minutes_watched,
        CAST(game_max_viewers AS BIGINT) AS game_max_viewers,
        CAST(viewership AS BIGINT[][]) AS viewership,
        CAST([] AS VARCHAR[]) AS languages, ${genres} AS game_genres
      FROM ${csv}`;
  }
  return `SELECT user_id, game, game_id, display_name, CAST(NULL AS VARCHAR) AS username,
      CAST(profile_pic AS VARCHAR) AS logo, CAST(NULL AS BIGINT) AS followers,
      CAST(game_airtime_minutes AS BIGINT) AS game_airtime_minutes,
      CAST(game_minutes_watched AS BIGINT) AS game_minutes_watched,
      CAST(game_max_viewers AS BIGINT) AS game_max_viewers,
      CAST(viewership AS BIGINT[][]) AS viewership,
      COALESCE(TRY_CAST(json(CAST(languages AS VARCHAR)) AS VARCHAR[]), CAST([] AS VARCHAR[])) AS languages,
      ${genres} AS game_genres
    FROM ${csv}`;
}

type DayTotals = {
  rows: number;
  channels: number;
  minutesWatched: number;
  heldRows: number;
  heldChannels: number;
  heldMinutesWatched: number;
  games: number;
  gameMinutesWatched: number;
};

/** Reads the day from S3 and leaves cg/cd/gd/gs .json (one row per line) in dir. */
function buildDay(
  platform: ShPlatform,
  date: string,
  accountsPath: string,
  dir: string,
  withSeries: boolean,
): DayTotals {
  const dayStart = Date.parse(`${date}T00:00:00Z`) / 1000;
  const gameFile = `s3://${BUCKET}/${gamePrefix(platform, date)}${date}.csv`;
  const sql = `
    INSTALL httpfs; LOAD httpfs; SET s3_region='us-east-1';
    CREATE SECRET (TYPE s3, PROVIDER credential_chain${
      awsProfile ? `, PROFILE '${awsProfile}'` : ""
    });
    SET preserve_insertion_order=false;
    SET temp_directory='${dir}/duck-tmp';

    CREATE TEMP TABLE acc AS
      SELECT user_id, any_value(creator_profile_id) AS creator_profile_id
      FROM read_csv('${accountsPath}', header=true, all_varchar=true) GROUP BY 1;
    CREATE TEMP TABLE raw AS ${channelSource(platform, date)};

    -- every channel counts for a game's channel count and genres
    CREATE TEMP TABLE game_meta AS
      SELECT COALESCE(game, '') AS game, count(DISTINCT user_id) AS channel_count,
             list_distinct(flatten(list(game_genres))) AS genres
      FROM raw GROUP BY 1;

    CREATE TEMP TABLE held AS
      SELECT raw.*, acc.creator_profile_id
      FROM raw JOIN acc USING (user_id);

    COPY (
      SELECT user_id, creator_profile_id, any_value(display_name) AS display_name,
             COALESCE(game, '') AS game, any_value(game_id) AS game_id,
             sum(game_airtime_minutes) AS airtime, sum(game_minutes_watched) AS mw,
             max(game_max_viewers) AS peak
      FROM held GROUP BY user_id, creator_profile_id, COALESCE(game, '')
    ) TO '${dir}/cg.json' (FORMAT json);

    -- the channel's day: its games joined minute by minute
    CREATE TEMP TABLE m AS
      SELECT user_id, p[1] AS ts, sum(p[2]) AS v
      FROM (SELECT user_id, unnest(viewership) AS p FROM held)
      WHERE p[1] >= ${dayStart} AND p[1] < ${dayStart + 86400}
      GROUP BY 1, 2;
    CREATE TEMP TABLE islands AS
      SELECT user_id, list([mn, mx + 1] ORDER BY mn) AS intervals
      FROM (
        SELECT user_id, min(minute) AS mn, max(minute) AS mx
        FROM (
          SELECT user_id, CAST((ts - ${dayStart}) / 60 AS INTEGER) AS minute,
                 CAST((ts - ${dayStart}) / 60 AS INTEGER)
                   - row_number() OVER (PARTITION BY user_id ORDER BY ts) AS grp
          FROM m
        ) GROUP BY user_id, grp
      ) GROUP BY user_id;
    CREATE TEMP TABLE chan AS
      SELECT user_id, count(*) AS airtime, sum(v) AS mw, max(v) AS peak,
             arg_max(ts, v) AS peak_ts
      FROM m GROUP BY 1;
    CREATE TEMP TABLE meta AS
      SELECT user_id, any_value(creator_profile_id) AS creator_profile_id,
             any_value(display_name) AS display_name, any_value(username) AS username,
             any_value(logo) AS logo, max(followers) AS followers,
             arg_max(game, game_minutes_watched) AS primary_game,
             list_distinct(list(game) FILTER (WHERE game IS NOT NULL AND game <> '')) AS games,
             list_distinct(flatten(list(languages))) AS languages
      FROM held GROUP BY 1;
    COPY (
      SELECT meta.*, chan.airtime, chan.mw, chan.peak, chan.peak_ts, islands.intervals
      FROM meta JOIN chan USING (user_id) JOIN islands USING (user_id)
    ) TO '${dir}/cd.json' (FORMAT json);

    -- the game file
    CREATE TEMP TABLE gf AS
      SELECT COALESCE(game, '') AS game, CAST(game_id AS VARCHAR) AS game_id,
             CAST(viewership AS BIGINT[][]) AS v, CAST(channelship AS BIGINT[][]) AS c
      FROM read_csv('${gameFile}', header=true,
        types={'game':'VARCHAR','game_id':'VARCHAR','viewership':'VARCHAR','channelship':'VARCHAR'});
    CREATE TEMP TABLE gv AS
      SELECT game, p[1] AS ts, sum(p[2]) AS v FROM (SELECT game, unnest(v) AS p FROM gf) GROUP BY 1, 2;
    CREATE TEMP TABLE gc AS
      SELECT game, p[1] AS ts, sum(p[2]) AS c FROM (SELECT game, unnest(c) AS p FROM gf) GROUP BY 1, 2;
    CREATE TEMP TABLE gm AS
      SELECT COALESCE(gv.game, gc.game) AS game, COALESCE(gv.ts, gc.ts) AS ts,
             COALESCE(gv.v, 0) AS v, COALESCE(gc.c, 0) AS c
      FROM gv FULL JOIN gc ON gv.game = gc.game AND gv.ts = gc.ts;
    CREATE TEMP TABLE gd AS
      SELECT gm.game, (SELECT any_value(game_id) FROM gf WHERE gf.game = gm.game) AS game_id,
             sum(v) AS mw, count(*) AS minutes_live, max(v) AS peak, arg_max(ts, v) AS peak_ts,
             sum(c) AS airtime, max(c) AS peak_channels
      FROM gm GROUP BY gm.game;
    COPY (
      SELECT gd.*, game_meta.channel_count, COALESCE(game_meta.genres, CAST([] AS VARCHAR[])) AS genres
      FROM gd LEFT JOIN game_meta USING (game)
    ) TO '${dir}/gd.json' (FORMAT json);
    ${
      withSeries
        ? `COPY (
      SELECT game,
             list(CAST((ts - ${dayStart}) / 60 AS INTEGER) ORDER BY ts) AS minutes,
             list(v ORDER BY ts) AS viewers, list(c ORDER BY ts) AS channels
      FROM gm WHERE game IN (SELECT game FROM gd WHERE mw >= ${SERIES_MIN_MINUTES_WATCHED})
      GROUP BY game
    ) TO '${dir}/gs.json' (FORMAT json);`
        : ""
    }

    SELECT json_object(
      'rows', (SELECT count(*) FROM raw),
      'channels', (SELECT count(DISTINCT user_id) FROM raw),
      'minutesWatched', (SELECT COALESCE(sum(game_minutes_watched), 0) FROM raw),
      'heldRows', (SELECT count(*) FROM held),
      'heldChannels', (SELECT count(DISTINCT user_id) FROM held),
      'heldMinutesWatched', (SELECT COALESCE(sum(game_minutes_watched), 0) FROM held),
      'games', (SELECT count(*) FROM gd),
      'gameMinutesWatched', (SELECT COALESCE(sum(mw), 0) FROM gd)
    );`;
  const out = duckdb(sql).trim().split("\n");
  return JSON.parse(out[out.length - 1]!) as DayTotals;
}

// ─── Writing ─────────────────────────────────────────────────────────────────

async function* readLines(path: string): AsyncGenerator<string> {
  if (!existsSync(path)) return;
  let rest = "";
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    const parts = (rest + (chunk as string)).split("\n");
    rest = parts.pop() ?? "";
    for (const part of parts) if (part.trim()) yield part;
  }
  if (rest.trim()) yield rest;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const retryable =
        /timed out|timeout|connection|ECONNRESET|Closed|terminat|P1001|P1017|P2024/i.test(
          message,
        );
      if (!retryable || attempt === DB_MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

/** Streams path, maps each line to a row, inserts in batches. */
async function insertFile<Row, Data>(
  path: string,
  map: (row: Row) => Data,
  insert: (data: Data[]) => Promise<{ count: number }>,
): Promise<number> {
  let batch: Data[] = [];
  let written = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    const data = batch;
    batch = [];
    written += (await withRetry(() => insert(data))).count;
  };
  for await (const line of readLines(path)) {
    batch.push(map(JSON.parse(line) as Row));
    if (batch.length >= INSERT_BATCH) await flush();
  }
  await flush();
  return written;
}

const text = (value: string | null | undefined, max: number): string | null => {
  if (value == null) return null;
  // Postgres rejects NUL; lone surrogates break the JSON protocol.
  const clean = value
    .replace(/\u0000/g, "")
    .toWellFormed()
    .trim();
  return clean ? clean.slice(0, max) : null;
};
const epoch = (seconds: number | null): Date | null =>
  seconds == null ? null : new Date(Number(seconds) * 1000);

async function writeDay(
  platform: ShPlatform,
  date: string,
  dir: string,
  withSeries: boolean,
) {
  const day = new Date(`${date}T00:00:00Z`);
  const where = { platform, date: day };
  // The day is replaced whole. Its source object says "running" until the
  // last row is in, so a reader can tell a half-written day from a done one.
  await withRetry(() => prisma.shChannelGameDaily.deleteMany({ where }));
  await withRetry(() => prisma.shChannelDaily.deleteMany({ where }));
  await withRetry(() => prisma.shGameDaily.deleteMany({ where }));
  await withRetry(() => prisma.shGameMinuteSeries.deleteMany({ where }));

  const channelGames = await insertFile(
    `${dir}/cg.json`,
    (r: {
      user_id: string;
      creator_profile_id: string;
      display_name: string | null;
      game: string;
      game_id: string | null;
      airtime: number;
      mw: number;
      peak: number | null;
    }): Prisma.ShChannelGameDailyCreateManyInput => ({
      platform,
      date: day,
      creatorProfileId: r.creator_profile_id,
      platformUserId: r.user_id,
      displayName: text(r.display_name, 200),
      gameName: text(r.game, 300) ?? "",
      shGameId: r.game_id,
      airtimeMinutes: Number(r.airtime),
      minutesWatched: BigInt(r.mw),
      averageViewers: r.airtime > 0 ? Number(r.mw) / Number(r.airtime) : null,
      peakViewers: r.peak == null ? null : Number(r.peak),
    }),
    (data) =>
      prisma.shChannelGameDaily.createMany({ data, skipDuplicates: true }),
  );

  const channels = await insertFile(
    `${dir}/cd.json`,
    (r: {
      user_id: string;
      creator_profile_id: string;
      display_name: string | null;
      username: string | null;
      logo: string | null;
      followers: number | null;
      primary_game: string | null;
      games: string[] | null;
      languages: string[] | null;
      airtime: number;
      mw: number;
      peak: number | null;
      peak_ts: number | null;
      intervals: number[][];
    }): Prisma.ShChannelDailyCreateManyInput => ({
      platform,
      date: day,
      creatorProfileId: r.creator_profile_id,
      platformUserId: r.user_id,
      username: text(r.username, 200),
      displayName: text(r.display_name, 200),
      logoUrl: text(r.logo, 1000),
      airtimeMinutes: Number(r.airtime),
      minutesWatched: BigInt(r.mw),
      averageViewers: r.airtime > 0 ? Number(r.mw) / Number(r.airtime) : null,
      peakViewers: r.peak == null ? null : Number(r.peak),
      peakViewersAt: epoch(r.peak_ts),
      followers: r.followers == null ? null : BigInt(r.followers),
      primaryGameName: text(r.primary_game, 300),
      gameNames: (r.games ?? [])
        .map((g) => text(g, 300))
        .filter((g): g is string => g !== null),
      languages: (r.languages ?? []).filter(Boolean),
      intervals: r.intervals,
    }),
    (data) => prisma.shChannelDaily.createMany({ data, skipDuplicates: true }),
  );

  const games = await insertFile(
    `${dir}/gd.json`,
    (r: {
      game: string;
      game_id: string | null;
      mw: number;
      minutes_live: number;
      peak: number | null;
      peak_ts: number | null;
      airtime: number;
      peak_channels: number | null;
      channel_count: number | null;
      genres: string[] | null;
    }): Prisma.ShGameDailyCreateManyInput => ({
      platform,
      date: day,
      gameName: text(r.game, 300) ?? "",
      shGameId: r.game_id,
      minutesWatched: BigInt(r.mw),
      minutesLive: Number(r.minutes_live),
      peakViewers: r.peak == null ? null : Number(r.peak),
      peakViewersAt: epoch(r.peak_ts),
      airtimeMinutes: BigInt(r.airtime),
      peakChannels: r.peak_channels == null ? null : Number(r.peak_channels),
      channelCount: r.channel_count == null ? null : Number(r.channel_count),
      genres: (r.genres ?? []).filter(Boolean),
    }),
    (data) => prisma.shGameDaily.createMany({ data, skipDuplicates: true }),
  );

  const series = withSeries
    ? await insertFile(
        `${dir}/gs.json`,
        (r: {
          game: string;
          minutes: number[];
          viewers: number[];
          channels: number[];
        }): Prisma.ShGameMinuteSeriesCreateManyInput => {
          // Dense from the first minute with data; a gap is 0.
          const start = r.minutes[0] ?? 0;
          const length = (r.minutes[r.minutes.length - 1] ?? start) - start + 1;
          const viewers = new Array<number>(length).fill(0);
          const channelsLive = new Array<number>(length).fill(0);
          r.minutes.forEach((minute, i) => {
            viewers[minute - start] = Number(r.viewers[i] ?? 0);
            channelsLive[minute - start] = Number(r.channels[i] ?? 0);
          });
          return {
            platform,
            date: day,
            gameName: text(r.game, 300) ?? "",
            startMinute: start,
            viewers,
            channels: channelsLive,
          };
        },
        (data) =>
          prisma.shGameMinuteSeries.createMany({ data, skipDuplicates: true }),
      )
    : 0;

  return { channelGames, channels, games, series };
}

// ─── One (platform, day) ─────────────────────────────────────────────────────

async function importDay(
  platform: ShPlatform,
  date: string,
  accountsPath: string,
): Promise<"imported" | "skipped" | "missing" | "dry-run"> {
  const channelFiles = listObjects(channelPrefix(platform, date));
  const gameFiles = listObjects(gamePrefix(platform, date));
  if (channelFiles.length === 0 || gameFiles.length === 0) {
    log("Files not there yet, skipping", {
      platform,
      date,
      channelFiles: channelFiles.length,
      gameFiles: gameFiles.length,
    });
    return "missing";
  }
  // One fingerprint for the day: any replaced file changes it.
  const etag = createHash("sha1")
    .update(
      [...channelFiles, ...gameFiles]
        .map((o) => `${o.key}:${o.etag}`)
        .sort()
        .join("|"),
    )
    .digest("hex");
  const size = [...channelFiles, ...gameFiles].reduce((n, o) => n + o.size, 0);
  const key = channelPrefix(platform, date);
  const existing = await prisma.streamHatchetSourceObject.findUnique({
    where: { bucket_key: { bucket: BUCKET, key } },
    select: { status: true, etag: true },
  });
  if (!force && existing?.status === "completed" && existing.etag === etag) {
    log("Already imported, files unchanged", { platform, date });
    return "skipped";
  }

  const dir = `${workDir}/${platform}-${date}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ageDays = (Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
  const withSeries = ageDays <= seriesDays;
  const started = Date.now();
  const totals = buildDay(platform, date, accountsPath, dir, withSeries);
  log("Day read", {
    platform,
    date,
    files: channelFiles.length + gameFiles.length,
    megabytes: Math.round(size / 1e6),
    seconds: Math.round((Date.now() - started) / 1000),
    replacing: existing?.status === "completed",
    ...totals,
    hoursWatched: Math.round(totals.minutesWatched / 60),
    heldShare:
      totals.minutesWatched > 0
        ? Number((totals.heldMinutesWatched / totals.minutesWatched).toFixed(4))
        : null,
  });
  if (!write) {
    rmSync(dir, { recursive: true, force: true });
    return "dry-run";
  }

  const day = new Date(`${date}T00:00:00Z`);
  const sourceObject = await withRetry(() =>
    prisma.streamHatchetSourceObject.upsert({
      where: { bucket_key: { bucket: BUCKET, key } },
      update: {
        etag,
        size: BigInt(size),
        status: "running",
        lastImportedAt: null,
        errorSummary: null,
      },
      create: {
        bucket: BUCKET,
        key,
        etag,
        size: BigInt(size),
        dataset: DATASET,
        platform,
        partitionDate: day,
        status: "running",
      },
      select: { id: true },
    }),
  );
  try {
    const written = await writeDay(platform, date, dir, withSeries);
    await withRetry(() =>
      prisma.streamHatchetSourceObject.update({
        where: { id: sourceObject.id },
        data: {
          status: "completed",
          rowCount: totals.rows,
          importedRows: written.channelGames,
          skippedRows: totals.rows - totals.heldRows,
          lastImportedAt: new Date(),
          metadata: { ...totals, written, files: channelFiles.length },
        },
      }),
    );
    log("Day written", { platform, date, ...written });
  } catch (err) {
    await prisma.streamHatchetSourceObject
      .update({
        where: { id: sourceObject.id },
        data: {
          status: "failed",
          errorSummary: (err instanceof Error
            ? err.message
            : String(err)
          ).slice(0, 1000),
        },
      })
      .catch(() => undefined);
    throw err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return "imported";
}

async function main() {
  const dates = resolveDates();
  const platforms = resolvePlatforms();
  mkdirSync(workDir, { recursive: true });
  log("Starting", {
    write,
    force,
    platforms,
    from: dates[0],
    to: dates[dates.length - 1],
    days: dates.length,
  });
  const counts: Record<string, number> = {};
  let failures = 0;
  for (const platform of platforms) {
    const accountsPath = await exportAccounts(platform);
    // Newest first: the site needs recent days before old ones.
    for (const date of [...dates].reverse()) {
      try {
        const result = await importDay(platform, date, accountsPath);
        counts[result] = (counts[result] ?? 0) + 1;
      } catch (err) {
        failures++;
        log("Day failed", {
          platform,
          date,
          error: (err instanceof Error ? err.message : String(err)).slice(
            0,
            2000,
          ),
        });
      }
    }
  }
  log("Done", { ...counts, failures });
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (err) => {
  log("Fatal", { error: err instanceof Error ? err.message : String(err) });
  await prisma.$disconnect();
  process.exit(1);
});
