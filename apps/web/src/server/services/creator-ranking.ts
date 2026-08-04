import { Prisma, type Platform } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { DISCOVERABLE_CREATOR_SQL } from "@/server/services/creator-visibility";

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
 * Scores over the window (last 7 ingested days):
 *   viewership -> MAX(daily averageViewers)  (candidates by minutesWatched)
 *   peak       -> MAX(daily peakViewers)     (candidates by peakViewers)
 * Game-filtered rankings use ChannelGameDailyRollup (SH gameName matches
 * Game.name), i.e. "creators who streamed this game recently".
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

const RANKING_WINDOW_DAYS = 7;
const CANDIDATE_SLACK = 200;

async function latestRollupDate(): Promise<Date | null> {
  // Backward index-only scan on (source, platform, date, platformUserId).
  const rows = await db.$queryRaw<Array<{ d: Date | null }>>(Prisma.sql`
    SELECT MAX(date) AS d
    FROM "ChannelDailyRollup"
    WHERE source = 'streamhatchet' AND platform = 'twitch'
  `);
  return rows[0]?.d ?? null;
}

export async function getViewershipRankedIds(opts: {
  sort: ViewershipSort;
  platform?: Platform | undefined;
  gameName?: string | null;
  take: number;
  skip: number;
}): Promise<string[]> {
  const shPlatforms = opts.platform
    ? SH_PLATFORM[opts.platform]
      ? [SH_PLATFORM[opts.platform] as string]
      : []
    : ALL_SH_PLATFORMS;
  if (shPlatforms.length === 0) return [];

  const latest = await latestRollupDate();
  if (!latest) return [];

  const dates: string[] = [];
  for (let i = 0; i < RANKING_WINDOW_DAYS; i += 1) {
    const day = new Date(latest);
    day.setUTCDate(day.getUTCDate() - i);
    dates.push(day.toISOString().slice(0, 10));
  }

  const perBranchLimit = opts.skip + opts.take + CANDIDATE_SLACK;
  const gameName = opts.gameName ?? null;
  const table = gameName
    ? Prisma.sql`"ChannelGameDailyRollup"`
    : Prisma.sql`"ChannelDailyRollup"`;
  // ChannelGameDailyRollup's only ranking index leads with minutesWatched, so
  // game-filtered peak candidates come from the watch-time index too.
  const fetchByPeak = !gameName && opts.sort === "peak";
  const gameCondition = gameName
    ? Prisma.sql`AND "gameName" = ${gameName}`
    : Prisma.empty;

  const branches: Prisma.Sql[] = [];
  for (const shPlatform of shPlatforms) {
    for (const date of dates) {
      branches.push(
        fetchByPeak
          ? Prisma.sql`(
              SELECT "creatorProfileId", "minutesWatched" AS mw,
                     "averageViewers" AS av, "peakViewers" AS pk
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
                     "averageViewers" AS av, "peakViewers" AS pk
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

  const scoreExpr =
    opts.sort === "peak" ? Prisma.sql`MAX(c.pk)` : Prisma.sql`MAX(c.av)`;

  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      ${Prisma.join(branches, " UNION ALL ")}
    ),
    ranked AS (
      SELECT c."creatorProfileId" AS id, ${scoreExpr} AS score, MAX(c.mw) AS mw
      FROM candidates c
      GROUP BY c."creatorProfileId"
    )
    SELECT cp.id
    FROM ranked r
    JOIN "CreatorProfile" cp ON cp.id = r.id
    WHERE ${DISCOVERABLE_CREATOR_SQL}
    ORDER BY r.score DESC NULLS LAST, r.mw DESC NULLS LAST
    LIMIT ${opts.take} OFFSET ${opts.skip}
  `);

  return rows.map((row) => row.id);
}

export type GameFilter = { slug: string; name: string };

/** Validate a ?game= slug against the Game table; unknown slugs are ignored. */
export async function resolveGameFilter(
  value: string | undefined | null,
): Promise<GameFilter | null> {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) return null;
  const game = await db.game.findUnique({
    where: { slug },
    select: { slug: true, name: true },
  });
  return game;
}

/** Top games offered in the /creators game filter dropdown. */
export async function getTopGameFilters(limit = 24): Promise<GameFilter[]> {
  return db.game.findMany({
    orderBy: { currentViewers: "desc" },
    take: limit,
    select: { slug: true, name: true },
  });
}
