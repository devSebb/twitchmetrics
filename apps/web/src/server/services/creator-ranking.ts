import { Prisma, type Platform } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { getLastCompleteStatsDay } from "@/server/services/creator-streaming-stats";
import { DISCOVERABLE_CREATOR_SQL } from "@/server/services/creator-visibility";
import { streamHatchetNamesForGame } from "@/server/services/streamhatchet/game-names";

/**
 * Viewership ranking for /creators (sort=viewership | sort=peak).
 *
 * There is no per-creator viewership column on CreatorProfile, and a naive
 * GROUP BY over ChannelDailyRollup seq-scans ~14M rows (~2s cold). Instead we
 * exploit the per-day ranking indexes:
 *   ChannelDailyRollup      (platform, date, minutesWatched DESC)
 *   ChannelDailyRollup      (platform, date, peakViewers DESC)
 *   ChannelGameDailyRollup  (platform, date, gameName, minutesWatched DESC)
 * Each (platform, day) of the window contributes a top-K branch read in pure
 * index order; the union (~a few thousand rows) is deduped per creator and
 * re-ranked. A creator in the merged top (skip+take) must appear in at least
 * one branch's top (skip+take), so pagination stays correct as long as the
 * per-branch limit >= skip + take (we add slack for unlisted/merged rows
 * dropped by the discoverability join).
 *
 * Scores over the window (the same 30 complete days the list columns and
 * /rankings cover; it was 7 days under a month-stamped title until the Stream
 * Hatchet review of 2026-11-25):
 *   viewership -> minutes watched / airtime  (candidates by minutesWatched),
 *                 for creators with at least 10 hours on air in the window
 *   peak       -> MAX(daily peakViewers)     (candidates by peakViewers)
 * A day on which a creator falls below the per-day candidate cut is not
 * counted; the cut is deep enough that this does not move the first pages.
 * Game-filtered rankings use ChannelGameDailyRollup, one branch per spelling
 * SH used for the game (streamHatchetNamesForGame), i.e. "creators who
 * streamed this game recently".
 */

export type ViewershipSort = "viewership" | "peak";

export function isViewershipSort(value: unknown): value is ViewershipSort {
  return value === "viewership" || value === "peak";
}

/** ChannelDailyRollup.platform values (Stream Hatchet naming). */
const SH_PLATFORM: Partial<Record<Platform, string>> = {
  twitch: "twitch",
  youtube: "yt",
  kick: "kick",
};

const ALL_SH_PLATFORMS = ["twitch", "kick", "yt"];

/** Platforms without stream rollups (instagram/tiktok/x) have no viewership
 * ranking; callers should fall back to the followers ordering. */
export function hasViewershipData(platform: Platform | undefined | null) {
  return !platform || Boolean(SH_PLATFORM[platform]);
}

export const CREATOR_RANKING_WINDOW_DAYS = 30;
const CANDIDATE_SLACK = 200;
/** As /rankings: a creator needs this much airtime to rank by average viewers. */
const AVG_MIN_AIRTIME_MINUTES = 600;

export async function getViewershipRankedIds(opts: {
  sort: ViewershipSort;
  platform?: Platform | undefined;
  gameId?: string | null;
  take: number;
  skip: number;
}): Promise<string[]> {
  const shPlatforms = opts.platform
    ? SH_PLATFORM[opts.platform]
      ? [SH_PLATFORM[opts.platform] as string]
      : []
    : ALL_SH_PLATFORMS;
  if (shPlatforms.length === 0) return [];

  const latest = await getLastCompleteStatsDay();

  const dates: string[] = [];
  for (let i = 0; i < CREATOR_RANKING_WINDOW_DAYS; i += 1) {
    const day = new Date(latest);
    day.setUTCDate(day.getUTCDate() - i);
    dates.push(day.toISOString().slice(0, 10));
  }

  const perBranchLimit = opts.skip + opts.take + CANDIDATE_SLACK;
  const gameNames = opts.gameId
    ? await streamHatchetNamesForGame(
        db,
        opts.gameId,
        new Date(`${dates[dates.length - 1]}T00:00:00Z`),
      )
    : null;
  const table = gameNames
    ? Prisma.sql`"ChannelGameDailyRollup"`
    : Prisma.sql`"ChannelDailyRollup"`;
  // ChannelGameDailyRollup's only ranking index leads with minutesWatched, so
  // game-filtered peak candidates come from the watch-time index too.
  const fetchByPeak = !gameNames && opts.sort === "peak";

  const branches: Prisma.Sql[] = [];
  for (const shPlatform of shPlatforms) {
    // No game filter: one unfiltered branch. A game: one per spelling, each
    // a short read of the (platform, date, gameName, minutesWatched) index.
    const gameConditions = gameNames
      ? (shPlatform === "yt" ? gameNames.youtube : gameNames.all).map(
          (name) => Prisma.sql`AND "gameName" = ${name}`,
        )
      : [Prisma.empty];
    for (const date of dates) {
      for (const gameCondition of gameConditions) {
        branches.push(
          fetchByPeak
            ? Prisma.sql`(
              SELECT "creatorProfileId", "minutesWatched" AS mw,
                     "airtimeMinutes" AS air, "peakViewers" AS pk
              FROM ${table}
              WHERE platform = ${shPlatform}
                AND date = ${date}::date
                AND "peakViewers" IS NOT NULL
                AND "creatorProfileId" IS NOT NULL
              ORDER BY "peakViewers" DESC
              LIMIT ${perBranchLimit}
            )`
            : Prisma.sql`(
              SELECT "creatorProfileId", "minutesWatched" AS mw,
                     "airtimeMinutes" AS air, "peakViewers" AS pk
              FROM ${table}
              WHERE platform = ${shPlatform}
                AND date = ${date}::date
                ${gameCondition}
                AND "creatorProfileId" IS NOT NULL
              ORDER BY "minutesWatched" DESC
              LIMIT ${perBranchLimit}
            )`,
        );
      }
    }
  }
  if (branches.length === 0) return [];

  const scoreExpr =
    opts.sort === "peak"
      ? Prisma.sql`MAX(c.pk)`
      : Prisma.sql`CASE WHEN SUM(c.air) >= ${AVG_MIN_AIRTIME_MINUTES}
                        THEN SUM(c.mw)::float8 / SUM(c.air) END`;

  // All platforms, no game: score the candidates from CreatorDailyRollup, the
  // table the list columns read. It counts a simulcast's airtime once and
  // holds every day of the window, so the order agrees with the Avg Viewers
  // and Peak Viewers shown beside each name.
  const ranked =
    !opts.platform && !gameNames
      ? Prisma.sql`
      SELECT r."creatorProfileId" AS id,
             ${
               opts.sort === "peak"
                 ? Prisma.sql`MAX(r."peakViewers")::float8`
                 : Prisma.sql`CASE WHEN SUM(r."uniqueAirtimeMinutes") >= ${AVG_MIN_AIRTIME_MINUTES}
                        THEN SUM(r."minutesWatched")::float8 / SUM(r."uniqueAirtimeMinutes") END`
             } AS score,
             SUM(r."minutesWatched") AS mw
      FROM "CreatorDailyRollup" r
      WHERE r."creatorProfileId" IN (
              SELECT DISTINCT c."creatorProfileId" FROM candidates c
            )
        AND r.date BETWEEN ${dates[dates.length - 1]}::date AND ${dates[0]}::date
      GROUP BY r."creatorProfileId"`
      : Prisma.sql`
      SELECT c."creatorProfileId" AS id, ${scoreExpr} AS score, SUM(c.mw) AS mw
      FROM candidates c
      GROUP BY c."creatorProfileId"`;

  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      ${Prisma.join(branches, " UNION ALL ")}
    ),
    ranked AS (${ranked})
    SELECT cp.id
    FROM ranked r
    JOIN "CreatorProfile" cp ON cp.id = r.id
    WHERE ${DISCOVERABLE_CREATOR_SQL}
      AND r.score IS NOT NULL
    ORDER BY r.score DESC, r.mw DESC NULLS LAST
    LIMIT ${opts.take} OFFSET ${opts.skip}
  `);

  return rows.map((row) => row.id);
}

export type GameFilter = { id: string; slug: string; name: string };

/** Validate a ?game= slug against the Game table; unknown slugs are ignored. */
export async function resolveGameFilter(
  value: string | undefined | null,
): Promise<GameFilter | null> {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) return null;
  const game = await db.game.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  return game;
}

/** Top games offered in the /creators game filter dropdown. */
export async function getTopGameFilters(
  limit = 24,
): Promise<Pick<GameFilter, "slug" | "name">[]> {
  return db.game.findMany({
    orderBy: { currentViewers: "desc" },
    take: limit,
    select: { slug: true, name: true },
  });
}
