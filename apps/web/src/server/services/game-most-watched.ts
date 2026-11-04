import { Prisma, type PrismaClient } from "@twitchmetrics/database";
import type { Platform } from "@twitchmetrics/database";
import { internalPlatformForStreamHatchet } from "@/server/services/streamhatchet-identity";
import { streamHatchetNamesForGame } from "@/server/services/streamhatchet/game-names";
import {
  completeDayWindow,
  type StatsWindow,
} from "@/server/services/streaming-stats";

export const MOST_WATCHED_DAYS = 7;
const MOST_WATCHED_LIMIT = 6;
const SH_PLATFORMS = ["twitch", "kick", "yt", "ytg"];
/**
 * Rows read per platform, day and name. The index on ChannelGameDailyRollup
 * is sorted by minutes watched within each (platform, date, gameName), so the
 * top rows of each day cost a short index read; summing every row instead
 * took 5.5 s for Just Chatting. A channel in the week's top six is far inside
 * its day's top 200 (measured 2026-11-04: GTA V's top six is identical).
 */
const ROWS_PER_DAY = 200;

export type MostWatchedChannel = {
  platform: Platform;
  platformUserId: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  hoursWatched: number;
  airtimeMinutes: number;
};

export type GameMostWatched = {
  channels: MostWatchedChannel[];
  /** The whole UTC days covered, as ISO dates (inclusive). */
  firstDay: string;
  lastDay: string;
};

type RankedRow = {
  platform: string;
  platformUserId: string;
  minutesWatched: bigint;
  airtimeMinutes: bigint;
  creatorProfileId: string | null;
  name: string;
};

/**
 * Channels with the most hours watched on a game over the last 7 complete
 * days, across Twitch, Kick and YouTube (QA 2026-11: Stream Hatchet ranks
 * Most Watched Channels by Hours Watched, not by viewers right now).
 *
 * Until per-game minutes are imported, a stream that played several games
 * has its hours split equally between them (see ChannelGameDailyRollup).
 */
export async function getGameMostWatched(
  prisma: PrismaClient,
  game: { id: string; name: string },
  lastCompleteDay: Date,
): Promise<GameMostWatched> {
  const window = completeDayWindow(MOST_WATCHED_DAYS, lastCompleteDay);
  const days = {
    firstDay: window.start.toISOString().slice(0, 10),
    lastDay: window.lastDay.toISOString().slice(0, 10),
  };

  const names = await streamHatchetNamesForGame(prisma, game.id, window.start);
  const reads = SH_PLATFORMS.flatMap((platform) =>
    (platform === "yt" || platform === "ytg" ? names.youtube : names.all).map(
      (name) => ({ platform, name }),
    ),
  );
  if (reads.length === 0) return { channels: [], ...days };

  const rows = await prisma.$queryRaw<RankedRow[]>(rankQuery(reads, window));
  const ranked = mergeYouTubeFeeds(rows).slice(0, MOST_WATCHED_LIMIT);

  const profileIds = [
    ...new Set(ranked.flatMap((row) => row.creatorProfileId ?? [])),
  ];
  const profiles = await prisma.creatorProfile.findMany({
    where: { id: { in: profileIds } },
    select: {
      id: true,
      slug: true,
      avatarUrl: true,
      listed: true,
      mergedInto: { select: { slug: true, avatarUrl: true, listed: true } },
    },
  });
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return {
    ...days,
    channels: ranked.map((row) => {
      const profile = row.creatorProfileId
        ? profileById.get(row.creatorProfileId)
        : undefined;
      // A merged stub links to the profile it was merged into. Only listed
      // profiles are linked: this card is a public directory.
      const target = profile?.mergedInto ?? profile;
      return {
        platform: row.platform,
        platformUserId: row.platformUserId,
        name: row.name,
        slug: target?.listed ? target.slug : null,
        avatarUrl: target?.avatarUrl ?? null,
        hoursWatched: Math.round(Number(row.minutesWatched) / 60),
        airtimeMinutes: Number(row.airtimeMinutes),
      };
    }),
  };
}

/** One index read per (platform, name) and day. */
function rankQuery(
  reads: { platform: string; name: string }[],
  window: StatsWindow,
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      t.platform,
      t."platformUserId",
      sum(t."minutesWatched")::bigint AS "minutesWatched",
      sum(t."airtimeMinutes")::bigint AS "airtimeMinutes",
      (array_agg(t."creatorProfileId" ORDER BY t.date DESC)
        FILTER (WHERE t."creatorProfileId" IS NOT NULL))[1] AS "creatorProfileId",
      (array_agg(coalesce(t."platformDisplayName", t."platformUsername")
        ORDER BY t.date DESC))[1] AS name
    FROM unnest(
      ${reads.map((read) => read.platform)}::text[],
      ${reads.map((read) => read.name)}::text[]
    ) AS r(platform, name)
    CROSS JOIN generate_series(
      ${window.start}::date,
      ${window.lastDay}::date,
      interval '1 day'
    ) AS d(day)
    CROSS JOIN LATERAL (
      SELECT platform, date, "platformUserId", "platformUsername",
        "platformDisplayName", "creatorProfileId", "minutesWatched",
        "airtimeMinutes"
      FROM "ChannelGameDailyRollup"
      WHERE platform = r.platform
        AND date = d.day::date
        AND "gameName" = r.name
      ORDER BY "minutesWatched" DESC
      LIMIT ${ROWS_PER_DAY}
    ) AS t
    GROUP BY t.platform, t."platformUserId"
    ORDER BY "minutesWatched" DESC
    LIMIT ${MOST_WATCHED_LIMIT * 2}`;
}

type MergedRow = Omit<RankedRow, "platform"> & { platform: Platform };

/**
 * SH files YouTube under two codes (yt, ytg); one channel can have rows in
 * both. They are one channel on one platform, so their hours add up.
 */
export function mergeYouTubeFeeds(rows: RankedRow[]): MergedRow[] {
  const byChannel = new Map<string, MergedRow>();
  for (const row of rows) {
    const platform = internalPlatformForStreamHatchet(row.platform);
    if (!platform) continue;
    const key = `${platform}:${row.platformUserId}`;
    const existing = byChannel.get(key);
    if (!existing) {
      byChannel.set(key, { ...row, platform });
      continue;
    }
    existing.minutesWatched += row.minutesWatched;
    existing.airtimeMinutes += row.airtimeMinutes;
    existing.creatorProfileId ??= row.creatorProfileId;
  }
  return [...byChannel.values()].sort((a, b) =>
    a.minutesWatched === b.minutesWatched
      ? 0
      : a.minutesWatched > b.minutesWatched
        ? -1
        : 1,
  );
}
