/**
 * Builds the published rankings (/rankings) into RankingEntry.
 *
 * Runs once a day, after the daily rollups (sh-daily-sessions.yml). Every
 * ranking covers the last 30 complete UTC days and stores each row's place in
 * the 30 days before, which is what the "vs last month" column shows.
 *
 * WHAT IT WRITES (kind / scope / metric):
 *   creator  all-platforms|twitch|youtube|kick   most-watched, average-viewers,
 *                                                peak-viewers
 *   creator  all-platforms|twitch|youtube        fastest-growing
 *   creator  every platform + all-platforms      most-followed
 *   creator  all-platforms, gameSlug=<game>      most-watched (top games only)
 *   category all-platforms                       most-watched, most-streamed
 *
 * THE RULES (agreed 2026-11-24; change them here and in the methodology copy,
 * apps/web/src/lib/rankings.ts):
 *   - Only listed, unmerged profiles that streamed inside the window are
 *     ranked, on every ranking including the follower ones.
 *   - all-platforms uses CreatorDailyRollup, so a simulcast counts once.
 *   - average-viewers needs AVG_MIN_AIRTIME_MINUTES on air in the window, so
 *     one short stream cannot top the list.
 *   - fastest-growing is followers gained in 30 days, from CreatorGrowthRollup.
 *     Only ~44k profiles (the API-polled ones) have that figure. Kick is left
 *     out: its follower counts were corrected in bulk in 2026-11, which reads
 *     as growth (xQc "+730k", Coringa "+304 %").
 *   - "Most active" (airtime) is NOT a ranking: the top is hundreds of 24/7
 *     channels tied at 720 h. Airtime is a column instead.
 *   - EXCLUDED_SLUGS holds channels whose source figures are impossible.
 *
 * Dry run by default: prints the top of each ranking. Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/build-rankings.ts
 *   npx tsx --env-file=apps/web/.env.local workers/build-rankings.ts --write
 *   ... --end-date 2026-10-31     (rebuild an older window, e.g. a month end)
 *   ... --skip-games              (creator and category rankings only)
 *   ... --out rankings.json       (also save the built rows, to review them)
 */
import { writeFileSync } from "node:fs";
import { Prisma, prisma } from "@twitchmetrics/database";
import {
  gameIdForName,
  indexGamesByName,
  isYouTubeVideoCategory,
  loadGameNameSources,
} from "../apps/web/src/server/services/streamhatchet/game-names";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const SKIP_GAMES = args.includes("--skip-games");
function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const WINDOW_DAYS = 30;
/** Places stored per ranking. Pages show 50; the rest is headroom. */
const DEPTH = 100;
/** How far down last period's ranking a row is looked up before it is "New". */
const PREVIOUS_DEPTH = 500;
const AVG_MIN_AIRTIME_MINUTES = 600;
/** Games that get a "top creators in <game>" ranking, by hours watched. */
const GAME_RANKING_COUNT = 100;
const GAME_DEPTH = 50;
const CATEGORY_DEPTH = 100;
/** A game ranking shorter than this is not published (thin page). */
const GAME_MIN_ROWS = 20;
const GROWTH_MAX_PCT_30D = 100;
const GROWTH_MIN_FOLLOWERS = 1_000;
const GROWTH_FRESH_DAYS = 7;
/** Daily snapshots kept for comparison; month ends are kept for good. */
const RETENTION_DAYS = 45;

/**
 * Channels left out of every ranking because the source figures cannot be
 * real. Keyed by profile slug, with the evidence.
 */
const EXCLUDED_SLUGS: Record<string, string> = {
  "hotspanish-vlogs-5e00bca3":
    "SH yt feed reports the same 1,044,681 average viewers every day on a 24/7 stream (2026-11-16..23), 322M hours in 30 days",
};

const STREAM_SCOPES = ["all-platforms", "twitch", "youtube", "kick"] as const;
const FOLLOWER_SCOPES = [
  "all-platforms",
  "twitch",
  "youtube",
  "kick",
  "instagram",
  "tiktok",
  "x",
] as const;
const GROWTH_SCOPES = ["all-platforms", "twitch", "youtube"] as const;
const GROWTH_PLATFORMS = ["twitch", "youtube"];
const SH_PLATFORM: Record<string, string> = {
  twitch: "twitch",
  youtube: "yt",
  kick: "kick",
};
const SH_PLATFORMS = Object.values(SH_PLATFORM);

type Entry = Prisma.RankingEntryCreateManyInput;
type StreamRow = { id: string; mw: number; air: number; pk: number | null };
type RankedStream = StreamRow & { metric: string; rk: number };

function log(message: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [build-rankings] ${message}`;
  console.log(data === undefined ? line : `${line} ${JSON.stringify(data)}`);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isMonthEnd(date: Date): boolean {
  return addDays(date, 1).getUTCDate() === 1;
}

const excludedSlugs = Object.keys(EXCLUDED_SLUGS);
/** Listed, unmerged and not excluded: who may appear in a ranking. */
const ELIGIBLE = Prisma.sql`
  cp."listed" = true AND cp."mergedIntoId" IS NULL
  AND cp.slug <> ALL(${excludedSlugs}::text[])
`;

/** Last complete day with creator rollups, never today (UTC). */
async function resolveWindowEnd(): Promise<Date> {
  const override = argValue("--end-date");
  if (override) return new Date(`${override}T00:00:00Z`);
  const yesterday = addDays(new Date(`${isoDay(new Date())}T00:00:00Z`), -1);
  const rows = await prisma.$queryRaw<{ d: Date | null }[]>(Prisma.sql`
    SELECT MAX(date) AS d FROM "CreatorDailyRollup"
    WHERE date <= ${isoDay(yesterday)}::date
  `);
  const latest = rows[0]?.d;
  if (!latest) throw new Error("CreatorDailyRollup is empty");
  return latest;
}

/** Per-creator totals over a window, for one scope. */
function streamAggregate(scope: string, start: Date, end: Date): Prisma.Sql {
  if (scope === "all-platforms") {
    return Prisma.sql`
      SELECT r."creatorProfileId" AS id,
             SUM(r."minutesWatched")::float8 AS mw,
             SUM(r."uniqueAirtimeMinutes")::float8 AS air,
             MAX(r."peakViewers") AS pk
      FROM "CreatorDailyRollup" r
      WHERE r.date BETWEEN ${isoDay(start)}::date AND ${isoDay(end)}::date
      GROUP BY 1
    `;
  }
  return Prisma.sql`
    SELECT r."creatorProfileId" AS id,
           SUM(r."minutesWatched")::float8 AS mw,
           SUM(r."airtimeMinutes")::float8 AS air,
           MAX(r."peakViewers") AS pk
    FROM "ChannelDailyRollup" r
    WHERE r.source = 'streamhatchet'
      AND r.platform = ${SH_PLATFORM[scope]}
      AND r.date BETWEEN ${isoDay(start)}::date AND ${isoDay(end)}::date
      AND r."creatorProfileId" IS NOT NULL
    GROUP BY 1
  `;
}

/** The top `depth` of the three viewership rankings for one scope and window. */
async function rankStreams(
  scope: string,
  start: Date,
  end: Date,
  depth: number,
): Promise<Map<string, RankedStream[]>> {
  const rows = await prisma.$queryRaw<RankedStream[]>(Prisma.sql`
    WITH agg AS MATERIALIZED (${streamAggregate(scope, start, end)}),
    elig AS MATERIALIZED (
      SELECT a.id, a.mw, a.air, a.pk
      FROM agg a JOIN "CreatorProfile" cp ON cp.id = a.id
      WHERE ${ELIGIBLE} AND a.mw > 0 AND a.air > 0
    )
    SELECT * FROM (
      SELECT 'most-watched' AS metric, id, mw, air, pk,
             ROW_NUMBER() OVER (ORDER BY mw DESC, id)::int AS rk
      FROM elig
    ) w WHERE rk <= ${depth}
    UNION ALL
    SELECT * FROM (
      SELECT 'average-viewers' AS metric, id, mw, air, pk,
             ROW_NUMBER() OVER (ORDER BY mw / air DESC, id)::int AS rk
      FROM elig WHERE air >= ${AVG_MIN_AIRTIME_MINUTES}
    ) a WHERE rk <= ${depth}
    UNION ALL
    SELECT * FROM (
      SELECT 'peak-viewers' AS metric, id, mw, air, pk,
             ROW_NUMBER() OVER (ORDER BY pk DESC, mw DESC, id)::int AS rk
      FROM elig WHERE pk IS NOT NULL
    ) p WHERE rk <= ${depth}
  `);
  const byMetric = new Map<string, RankedStream[]>();
  for (const row of rows) {
    const list = byMetric.get(row.metric) ?? [];
    list.push(row);
    byMetric.set(row.metric, list);
  }
  for (const list of byMetric.values()) list.sort((a, b) => a.rk - b.rk);
  return byMetric;
}

function streamValue(metric: string, row: StreamRow): number {
  if (metric === "most-watched") return row.mw;
  if (metric === "average-viewers") return row.mw / row.air;
  return row.pk ?? 0;
}

/** Window totals for named creators (rows of follower and growth rankings). */
async function streamStatsFor(
  scope: string,
  ids: string[],
  start: Date,
  end: Date,
): Promise<Map<string, StreamRow>> {
  const stats = new Map<string, StreamRow>();
  // Instagram, TikTok and X have no streams of their own: show the creator's
  // streaming across every platform there.
  const source = SH_PLATFORM[scope] ? scope : "all-platforms";
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const inner =
      source === "all-platforms"
        ? Prisma.sql`
          SELECT r."creatorProfileId" AS id,
                 SUM(r."minutesWatched")::float8 AS mw,
                 SUM(r."uniqueAirtimeMinutes")::float8 AS air,
                 MAX(r."peakViewers") AS pk
          FROM "CreatorDailyRollup" r
          WHERE r."creatorProfileId" = ANY(${chunk}::uuid[])
            AND r.date BETWEEN ${isoDay(start)}::date AND ${isoDay(end)}::date
          GROUP BY 1`
        : Prisma.sql`
          SELECT r."creatorProfileId" AS id,
                 SUM(r."minutesWatched")::float8 AS mw,
                 SUM(r."airtimeMinutes")::float8 AS air,
                 MAX(r."peakViewers") AS pk
          FROM "ChannelDailyRollup" r
          WHERE r."creatorProfileId" = ANY(${chunk}::uuid[])
            AND r.platform = ${SH_PLATFORM[source]}
            AND r.date BETWEEN ${isoDay(start)}::date AND ${isoDay(end)}::date
          GROUP BY 1`;
    const rows = await prisma.$queryRaw<StreamRow[]>(inner);
    for (const row of rows) stats.set(row.id, row);
  }
  return stats;
}

type FollowerInfo = {
  followers: number | null;
  delta30d: number | null;
  pct30d: number | null;
};

/** Followers and 30-day follower change for named creators, per scope. */
async function followerInfoFor(
  scope: string,
  ids: string[],
): Promise<Map<string, FollowerInfo>> {
  const info = new Map<string, FollowerInfo>();
  const since = addDays(new Date(), -GROWTH_FRESH_DAYS);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const followers =
      scope === "all-platforms"
        ? await prisma.$queryRaw<{ id: string; f: number | null }[]>(Prisma.sql`
            SELECT cp.id, cp."totalFollowers"::float8 AS f
            FROM "CreatorProfile" cp WHERE cp.id = ANY(${chunk}::uuid[])`)
        : await prisma.$queryRaw<{ id: string; f: number | null }[]>(Prisma.sql`
            SELECT pa."creatorProfileId" AS id,
                   COALESCE(pa."followerCount", pa."subscriberCount")::float8 AS f
            FROM "PlatformAccount" pa
            WHERE pa."creatorProfileId" = ANY(${chunk}::uuid[])
              AND pa.platform = ${scope}::"Platform"`);
    for (const row of followers) {
      info.set(row.id, { followers: row.f, delta30d: null, pct30d: null });
    }
    const platforms =
      scope === "all-platforms"
        ? GROWTH_PLATFORMS
        : GROWTH_PLATFORMS.includes(scope)
          ? [scope]
          : [];
    if (platforms.length === 0) continue;
    const growth = await prisma.$queryRaw<
      { id: string; d: number; base: number }[]
    >(Prisma.sql`
      SELECT g."creatorProfileId" AS id,
             SUM(g."delta30d")::float8 AS d,
             SUM(g."followerCount" - g."delta30d")::float8 AS base
      FROM "CreatorGrowthRollup" g
      WHERE g."creatorProfileId" = ANY(${chunk}::uuid[])
        AND g.platform::text = ANY(${platforms}::text[])
        AND g."delta30d" IS NOT NULL
        AND g."computedAt" >= ${since}
      GROUP BY 1
    `);
    for (const row of growth) {
      const existing = info.get(row.id);
      if (!existing) continue;
      existing.delta30d = row.d;
      existing.pct30d = row.base > 0 ? (row.d / row.base) * 100 : null;
    }
  }
  return info;
}

function creatorStats(stream: StreamRow | undefined, follow?: FollowerInfo) {
  return {
    minutesWatched: stream ? Math.round(stream.mw) : null,
    avgViewers:
      stream && stream.air > 0 ? Math.round(stream.mw / stream.air) : null,
    peakViewers: stream?.pk ?? null,
    airtimeMinutes: stream ? Math.round(stream.air) : null,
    followers: follow?.followers ?? null,
    followerDelta30d: follow?.delta30d ?? null,
    followerPct30d:
      follow?.pct30d == null ? null : Math.round(follow.pct30d * 10) / 10,
  };
}

/**
 * Streamed inside the window. The viewership rankings get this for free; the
 * follower ones need it spelled out, or they fill with listed profiles that
 * no longer stream (brands, clubs, musicians: Nike, NASA, Taylor Swift).
 */
function streamedIn(start: Date, end: Date): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "CreatorDailyRollup" live
    WHERE live."creatorProfileId" = cp.id
      AND live.date BETWEEN ${isoDay(start)}::date AND ${isoDay(end)}::date
  )`;
}

/** Top `limit` by followers for a scope, as [id, followers]. */
async function topFollowed(
  scope: string,
  limit: number,
  start: Date,
  end: Date,
): Promise<{ id: string; f: number }[]> {
  if (scope === "all-platforms") {
    return prisma.$queryRaw(Prisma.sql`
      SELECT cp.id, cp."totalFollowers"::float8 AS f
      FROM "CreatorProfile" cp
      WHERE ${ELIGIBLE} AND cp."totalFollowers" > 0
        AND ${streamedIn(start, end)}
      ORDER BY cp."totalFollowers" DESC, cp.id
      LIMIT ${limit}
    `);
  }
  return prisma.$queryRaw(Prisma.sql`
    SELECT cp.id,
           COALESCE(pa."followerCount", pa."subscriberCount")::float8 AS f
    FROM "PlatformAccount" pa
    JOIN "CreatorProfile" cp ON cp.id = pa."creatorProfileId"
    WHERE pa.platform = ${scope}::"Platform"
      AND COALESCE(pa."followerCount", pa."subscriberCount") > 0
      AND ${ELIGIBLE}
      AND ${streamedIn(start, end)}
    ORDER BY COALESCE(pa."followerCount", pa."subscriberCount") DESC NULLS LAST
    LIMIT ${limit}
  `);
}

async function topGrowing(
  scope: string,
  limit: number,
  start: Date,
  end: Date,
): Promise<{ id: string; d: number }[]> {
  const platforms = scope === "all-platforms" ? GROWTH_PLATFORMS : [scope];
  const since = addDays(new Date(), -GROWTH_FRESH_DAYS);
  return prisma.$queryRaw(Prisma.sql`
    SELECT g."creatorProfileId" AS id, SUM(g."delta30d")::float8 AS d
    FROM "CreatorGrowthRollup" g
    JOIN "CreatorProfile" cp ON cp.id = g."creatorProfileId"
    WHERE g.platform::text = ANY(${platforms}::text[])
      AND g."delta30d" > 0
      AND g."pct30d" <= ${GROWTH_MAX_PCT_30D}
      AND g."followerCount" >= ${GROWTH_MIN_FOLLOWERS}
      AND g."computedAt" >= ${since}
      AND ${ELIGIBLE}
      AND ${streamedIn(start, end)}
    GROUP BY 1
    ORDER BY d DESC, id
    LIMIT ${limit}
  `);
}

/** Places a stored ranking held `WINDOW_DAYS` earlier, if one was written. */
async function storedPrevious(
  where: { kind: string; scope: string; metric: string; gameSlug: string },
  previousEnd: Date,
): Promise<Map<string, { rank: number; value: number }> | null> {
  const rows = await prisma.rankingEntry
    .findMany({
      where: { ...where, windowDays: WINDOW_DAYS, windowEnd: previousEnd },
      select: { creatorProfileId: true, gameId: true, rank: true, value: true },
    })
    .catch((error: unknown) => {
      // P2021: the table is not there yet. A dry run before the migration is
      // applied should still print the rankings.
      if (!WRITE && (error as { code?: string }).code === "P2021") return [];
      throw error;
    });
  if (rows.length === 0) return null;
  return new Map(
    rows.map((row) => [
      (row.creatorProfileId ?? row.gameId) as string,
      { rank: row.rank, value: row.value },
    ]),
  );
}

async function buildCreatorRankings(
  end: Date,
  entries: Entry[],
): Promise<void> {
  const start = addDays(end, -(WINDOW_DAYS - 1));
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(WINDOW_DAYS - 1));
  const base = { kind: "creator", windowEnd: end, windowDays: WINDOW_DAYS };

  for (const scope of STREAM_SCOPES) {
    const [current, previous] = [
      await rankStreams(scope, start, end, DEPTH),
      await rankStreams(scope, previousStart, previousEnd, PREVIOUS_DEPTH),
    ];
    const ids = [
      ...new Set([...current.values()].flatMap((l) => l.map((r) => r.id))),
    ];
    const follow = await followerInfoFor(scope, ids);
    for (const [metric, rows] of current) {
      const before = new Map(
        (previous.get(metric) ?? []).map((row) => [row.id, row]),
      );
      for (const row of rows) {
        const prior = before.get(row.id);
        entries.push({
          ...base,
          scope,
          metric,
          rank: row.rk,
          creatorProfileId: row.id,
          value: streamValue(metric, row),
          previousRank: prior?.rk ?? null,
          previousValue: prior ? streamValue(metric, prior) : null,
          hasPrevious: before.size > 0,
          stats: creatorStats(row, follow.get(row.id)),
        });
      }
      log(`creator ${scope} ${metric}`, { rows: rows.length });
    }
  }

  for (const scope of FOLLOWER_SCOPES) {
    const candidates = await topFollowed(scope, PREVIOUS_DEPTH, start, end);
    const ids = candidates.map((row) => row.id);
    const follow = await followerInfoFor(scope, ids);
    // Last period's order: today's count minus the 30-day change, where that
    // change is known. Unknown rows hold their count but get no "previous".
    const before = candidates
      .map((row) => ({
        id: row.id,
        was: row.f - (follow.get(row.id)?.delta30d ?? 0),
      }))
      .sort((a, b) => b.was - a.was);
    const previousRank = new Map(before.map((row, i) => [row.id, i + 1]));
    const top = candidates.slice(0, DEPTH);
    const streams = await streamStatsFor(
      scope,
      top.map((row) => row.id),
      start,
      end,
    );
    top.forEach((row, index) => {
      const info = follow.get(row.id);
      const known = info?.delta30d != null;
      entries.push({
        ...base,
        scope,
        metric: "most-followed",
        rank: index + 1,
        creatorProfileId: row.id,
        value: row.f,
        previousRank: known ? (previousRank.get(row.id) ?? null) : null,
        previousValue: known ? row.f - (info?.delta30d ?? 0) : null,
        hasPrevious: known,
        stats: creatorStats(streams.get(row.id), info),
      });
    });
    log(`creator ${scope} most-followed`, { rows: top.length });
  }

  for (const scope of GROWTH_SCOPES) {
    const top = await topGrowing(scope, DEPTH, start, end);
    const ids = top.map((row) => row.id);
    const [follow, streams, before] = [
      await followerInfoFor(scope, ids),
      await streamStatsFor(scope, ids, start, end),
      // No table holds last period's gains, so movement appears once this
      // worker has been writing for WINDOW_DAYS.
      await storedPrevious(
        { kind: "creator", scope, metric: "fastest-growing", gameSlug: "" },
        previousEnd,
      ),
    ];
    top.forEach((row, index) => {
      const prior = before?.get(row.id);
      entries.push({
        ...base,
        scope,
        metric: "fastest-growing",
        rank: index + 1,
        creatorProfileId: row.id,
        value: row.d,
        previousRank: prior?.rank ?? null,
        previousValue: prior?.value ?? null,
        hasPrevious: before != null,
        stats: creatorStats(streams.get(row.id), follow.get(row.id)),
      });
    });
    log(`creator ${scope} fastest-growing`, { rows: top.length });
  }
}

type GameTotals = {
  gameId: string;
  mw: number;
  air: number;
  channelDays: number;
};

/** Catalog games' totals over a window, from every platform's daily rollup. */
async function categoryTotals(
  start: Date,
  end: Date,
  index: Map<string, string>,
): Promise<GameTotals[]> {
  const rows = await prisma.$queryRaw<
    {
      platform: string;
      gameName: string;
      mw: number;
      air: number;
      ch: number;
    }[]
  >(Prisma.sql`
    SELECT platform, "gameName",
           SUM("minutesWatched")::float8 AS mw,
           SUM("airtimeMinutes")::float8 AS air,
           SUM("channelCount")::float8 AS ch
    FROM "GameDailyRollup"
    WHERE source = 'streamhatchet'
      AND platform = ANY(${SH_PLATFORMS}::text[])
      AND date BETWEEN ${isoDay(start)}::date AND ${isoDay(end)}::date
    GROUP BY 1, 2
  `);
  const totals = new Map<string, GameTotals>();
  for (const row of rows) {
    const gameId = gameIdForName(index, row.gameName, row.platform);
    if (!gameId) continue;
    const total = totals.get(gameId) ?? {
      gameId,
      mw: 0,
      air: 0,
      channelDays: 0,
    };
    total.mw += row.mw;
    total.air += row.air;
    total.channelDays += row.ch;
    totals.set(gameId, total);
  }
  return [...totals.values()];
}

const CATEGORY_METRICS: Record<string, (t: GameTotals) => number> = {
  "most-watched": (t) => t.mw,
  "most-streamed": (t) => t.air,
};

function rankCategories(totals: GameTotals[], metric: string) {
  const value = CATEGORY_METRICS[metric] as (t: GameTotals) => number;
  return totals
    .filter((t) => value(t) > 0)
    .sort((a, b) => value(b) - value(a) || a.gameId.localeCompare(b.gameId));
}

/** Top creators of one game, every platform, simulcasts' airtime merged. */
async function rankGameCreators(
  names: { all: string[]; youtube: string[] },
  start: Date,
  end: Date,
  depth: number,
): Promise<StreamRow[]> {
  if (names.all.length === 0) return [];
  return prisma.$queryRaw<StreamRow[]>(Prisma.sql`
    WITH per_platform AS (
      SELECT r."creatorProfileId" AS id, r.date, r.platform,
             SUM(r."minutesWatched") AS mw,
             SUM(r."airtimeMinutes") AS air,
             MAX(r."peakViewers") AS pk
      FROM "ChannelGameDailyRollup" r
      WHERE r.source = 'streamhatchet'
        AND r.date BETWEEN ${isoDay(start)}::date AND ${isoDay(end)}::date
        AND r."creatorProfileId" IS NOT NULL
        AND (
          (r.platform = ANY(${["twitch", "kick"]}::text[])
            AND r."gameName" = ANY(${names.all}::text[]))
          OR (r.platform = 'yt'
            AND r."gameName" = ANY(${names.youtube}::text[]))
        )
      GROUP BY 1, 2, 3
    ),
    -- A simulcast is the same hours on two platforms: watch time adds up,
    -- time on air does not, so a day's airtime is its longest platform.
    per_day AS (
      SELECT id, date, SUM(mw) AS mw, MAX(air) AS air, MAX(pk) AS pk
      FROM per_platform GROUP BY 1, 2
    ),
    agg AS (
      SELECT id, SUM(mw)::float8 AS mw, SUM(air)::float8 AS air, MAX(pk) AS pk
      FROM per_day GROUP BY 1
    )
    SELECT a.id, a.mw, a.air, a.pk
    FROM agg a JOIN "CreatorProfile" cp ON cp.id = a.id
    WHERE ${ELIGIBLE} AND a.mw > 0 AND a.air > 0
    ORDER BY a.mw DESC, a.id
    LIMIT ${depth}
  `);
}

async function buildCategoryAndGameRankings(
  end: Date,
  entries: Entry[],
): Promise<void> {
  const start = addDays(end, -(WINDOW_DAYS - 1));
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(WINDOW_DAYS - 1));
  const base = {
    scope: "all-platforms",
    windowEnd: end,
    windowDays: WINDOW_DAYS,
  };

  const sources = await loadGameNameSources(prisma);
  const index = indexGamesByName(sources.games, sources.aliases);
  const [current, previous] = [
    await categoryTotals(start, end, index),
    await categoryTotals(previousStart, previousEnd, index),
  ];

  for (const metric of Object.keys(CATEGORY_METRICS)) {
    const value = CATEGORY_METRICS[metric] as (t: GameTotals) => number;
    const before = new Map(
      rankCategories(previous, metric).map((t, i) => [
        t.gameId,
        { rank: i + 1, value: value(t) },
      ]),
    );
    const top = rankCategories(current, metric).slice(0, CATEGORY_DEPTH);
    top.forEach((t, i) => {
      const prior = before.get(t.gameId);
      entries.push({
        ...base,
        kind: "category",
        metric,
        rank: i + 1,
        gameId: t.gameId,
        value: value(t),
        previousRank: prior?.rank ?? null,
        previousValue: prior?.value ?? null,
        hasPrevious: before.size > 0,
        stats: {
          minutesWatched: Math.round(t.mw),
          // Concurrent average: watch time over every minute of the window.
          avgViewers: Math.round(t.mw / (WINDOW_DAYS * 1440)),
          airtimeMinutes: Math.round(t.air),
          avgChannels: Math.round(t.channelDays / WINDOW_DAYS),
        },
      });
    });
    log(`category ${metric}`, { rows: top.length });
  }

  if (SKIP_GAMES) return;

  // Every spelling the rollups used for each game across both windows.
  const spellings = await prisma.$queryRaw<
    { platform: string; gameName: string }[]
  >(Prisma.sql`
    SELECT DISTINCT platform, "gameName" FROM "GameDailyRollup"
    WHERE source = 'streamhatchet'
      AND platform = ANY(${SH_PLATFORMS}::text[])
      AND date BETWEEN ${isoDay(previousStart)}::date AND ${isoDay(end)}::date
  `);
  const namesByGame = new Map<string, Set<string>>();
  for (const row of spellings) {
    const gameId = gameIdForName(index, row.gameName, "twitch");
    if (!gameId) continue;
    const set = namesByGame.get(gameId) ?? new Set<string>();
    set.add(row.gameName);
    namesByGame.set(gameId, set);
  }
  const games = await prisma.game.findMany({
    where: {
      id: {
        in: rankCategories(current, "most-watched")
          .slice(0, GAME_RANKING_COUNT)
          .map((t) => t.gameId),
      },
    },
    select: { id: true, slug: true },
  });

  let published = 0;
  for (const game of games) {
    const all = [...(namesByGame.get(game.id) ?? [])];
    const names = {
      all,
      youtube: all.filter((name) => !isYouTubeVideoCategory(name)),
    };
    const [rows, before] = [
      await rankGameCreators(names, start, end, GAME_DEPTH),
      await rankGameCreators(names, previousStart, previousEnd, PREVIOUS_DEPTH),
    ];
    if (rows.length < GAME_MIN_ROWS) continue;
    const previousRank = new Map(before.map((row, i) => [row.id, i + 1]));
    const previousRow = new Map(before.map((row) => [row.id, row]));
    const follow = await followerInfoFor(
      "all-platforms",
      rows.map((row) => row.id),
    );
    rows.forEach((row, i) => {
      entries.push({
        ...base,
        kind: "creator",
        metric: "most-watched",
        gameSlug: game.slug,
        rank: i + 1,
        creatorProfileId: row.id,
        value: row.mw,
        previousRank: previousRank.get(row.id) ?? null,
        previousValue: previousRow.get(row.id)?.mw ?? null,
        hasPrevious: before.length > 0,
        stats: creatorStats(row, follow.get(row.id)),
      });
    });
    published += 1;
    if (published % 20 === 0) log("game rankings", { published });
  }
  log("game rankings", { games: games.length, published });
}

async function printPreview(entries: Entry[]) {
  const creatorIds = [
    ...new Set(entries.flatMap((e) => e.creatorProfileId ?? [])),
  ];
  const gameIds = [...new Set(entries.flatMap((e) => e.gameId ?? []))];
  const names = new Map<string, string>();
  for (let i = 0; i < creatorIds.length; i += 1000) {
    const rows = await prisma.creatorProfile.findMany({
      where: { id: { in: creatorIds.slice(i, i + 1000) } },
      select: { id: true, displayName: true },
    });
    for (const row of rows) names.set(row.id, row.displayName);
  }
  const games = await prisma.game.findMany({
    where: { id: { in: gameIds } },
    select: { id: true, name: true },
  });
  for (const game of games) names.set(game.id, game.name);

  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (entry.gameSlug && entry.gameSlug !== "fortnite") continue;
    const key = `${entry.kind} / ${entry.scope} / ${entry.metric}${
      entry.gameSlug ? ` / ${entry.gameSlug}` : ""
    }`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    console.log(`\n${key} (${list.length} rows)`);
    for (const entry of list.slice(0, 8)) {
      const id = (entry.creatorProfileId ?? entry.gameId) as string;
      const move = !entry.hasPrevious
        ? "n/a"
        : entry.previousRank == null
          ? "new"
          : `was ${entry.previousRank}`;
      console.log(
        `  ${String(entry.rank).padStart(3)}  ${(names.get(id) ?? id).padEnd(32).slice(0, 32)} ${Math.round(entry.value).toLocaleString("en-US").padStart(16)}  ${move}`,
      );
    }
  }
}

async function writeEntries(end: Date, entries: Entry[]) {
  const steps: Prisma.PrismaPromise<unknown>[] = [
    prisma.rankingEntry.deleteMany({
      where: { windowEnd: end, windowDays: WINDOW_DAYS },
    }),
  ];
  for (let i = 0; i < entries.length; i += 1000) {
    steps.push(
      prisma.rankingEntry.createMany({ data: entries.slice(i, i + 1000) }),
    );
  }
  // One transaction: a reader never sees a half-written day.
  await prisma.$transaction(steps);

  // Older days: game rankings keep only the newest day, the rest keep
  // RETENTION_DAYS (what "vs last month" reads); month ends stay for good.
  const old = await prisma.rankingEntry.findMany({
    where: { windowEnd: { lt: end } },
    distinct: ["windowEnd"],
    select: { windowEnd: true },
  });
  const cutoff = addDays(end, -RETENTION_DAYS);
  for (const { windowEnd } of old) {
    if (isMonthEnd(windowEnd)) continue;
    await prisma.rankingEntry.deleteMany({
      where:
        windowEnd < cutoff
          ? { windowEnd }
          : { windowEnd, gameSlug: { not: "" } },
    });
  }
}

async function main() {
  const end = await resolveWindowEnd();
  log("start", {
    mode: WRITE ? "write" : "dry-run",
    windowEnd: isoDay(end),
    windowDays: WINDOW_DAYS,
    excluded: excludedSlugs,
  });

  const entries: Entry[] = [];
  await buildCreatorRankings(end, entries);
  await buildCategoryAndGameRankings(end, entries);

  await printPreview(entries);
  log("built", { entries: entries.length });
  const out = argValue("--out");
  if (out) {
    writeFileSync(out, JSON.stringify(entries));
    log("saved", { file: out });
  }

  if (!WRITE) {
    log("dry run: nothing written (pass --write)");
    return;
  }
  await writeEntries(end, entries);
  log("written", { entries: entries.length, windowEnd: isoDay(end) });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
