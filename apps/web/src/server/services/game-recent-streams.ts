import { Prisma, type PrismaClient } from "@twitchmetrics/database";
import type { Platform } from "@twitchmetrics/database";
import { loadChannelLinks } from "@/server/services/game-most-watched";
import { internalPlatformForStreamHatchet } from "@/server/services/streamhatchet-identity";
import { streamHatchetNamesForGame } from "@/server/services/streamhatchet/game-names";
import { completeDayWindow } from "@/server/services/streaming-stats";

export const RECENT_STREAM_DAYS = 7;
const STREAMS_PER_DAY = 5;
const SH_PLATFORMS = ["twitch", "kick", "yt", "ytg"];

export type GameStream = {
  /** The UTC day, as an ISO date. */
  day: string;
  platform: Platform;
  platformUserId: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  /** Minutes the channel streamed this game that day. */
  airtimeMinutes: number;
  averageViewers: number;
  peakViewers: number | null;
  hoursWatched: number;
};

export type GameRecentStreams = {
  streams: GameStream[];
  firstDay: string;
  lastDay: string;
};

export type StreamRow = {
  platform: string;
  date: Date;
  platformUserId: string;
  name: string;
  creatorProfileId: string | null;
  minutesWatched: bigint;
  airtimeMinutes: number;
  peakViewers: number | null;
};

type DayStream = Omit<StreamRow, "platform"> & { platform: Platform };

/**
 * The biggest streams of each day, newest day first. Stream Hatchet files
 * YouTube under two codes (yt, ytg) and a game under several spellings; one
 * channel's rows for a day are one stream day, so they add up.
 */
export function topStreamsPerDay(
  rows: StreamRow[],
  perDay: number,
): DayStream[] {
  const byChannelDay = new Map<string, DayStream>();
  for (const row of rows) {
    const platform = internalPlatformForStreamHatchet(row.platform);
    if (!platform) continue;
    const key = `${row.date.toISOString()}:${platform}:${row.platformUserId}`;
    const existing = byChannelDay.get(key);
    if (!existing) {
      byChannelDay.set(key, { ...row, platform });
      continue;
    }
    existing.minutesWatched += row.minutesWatched;
    existing.airtimeMinutes += row.airtimeMinutes;
    existing.creatorProfileId ??= row.creatorProfileId;
    if (row.peakViewers !== null) {
      existing.peakViewers = Math.max(
        existing.peakViewers ?? 0,
        row.peakViewers,
      );
    }
  }

  const byDay = new Map<number, DayStream[]>();
  for (const stream of byChannelDay.values()) {
    const day = stream.date.getTime();
    byDay.set(day, [...(byDay.get(day) ?? []), stream]);
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => right - left)
    .flatMap(([, streams]) =>
      streams
        .sort((a, b) => Number(b.minutesWatched - a.minutesWatched))
        .slice(0, perDay),
    );
}

/**
 * The most watched streams of a game on each of the last 7 complete days,
 * across Twitch, Kick and YouTube. A row is a channel's time on this game
 * that day: a stream that played several games counts only its share (see
 * game-most-watched.ts, which ranks the same rows over the whole week).
 */
export async function getGameRecentStreams(
  prisma: PrismaClient,
  game: { id: string },
  lastCompleteDay: Date,
): Promise<GameRecentStreams> {
  const window = completeDayWindow(RECENT_STREAM_DAYS, lastCompleteDay);
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
  if (reads.length === 0) return { streams: [], ...days };

  // One short index read per (platform, name) and day: the index is sorted
  // by minutes watched within each.
  const rows = await prisma.$queryRaw<StreamRow[]>(Prisma.sql`
    SELECT
      t.platform,
      t.date,
      t."platformUserId",
      coalesce(t."platformDisplayName", t."platformUsername") AS name,
      t."creatorProfileId",
      t."minutesWatched",
      t."airtimeMinutes",
      t."peakViewers"
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
        "airtimeMinutes", "peakViewers"
      FROM "ChannelGameDailyRollup"
      WHERE platform = r.platform
        AND date = d.day::date
        AND "gameName" = r.name
      ORDER BY "minutesWatched" DESC
      LIMIT ${STREAMS_PER_DAY}
    ) AS t`);

  const top = topStreamsPerDay(rows, STREAMS_PER_DAY);
  const links = await loadChannelLinks(
    prisma,
    top.flatMap((stream) => stream.creatorProfileId ?? []),
  );

  return {
    ...days,
    streams: top.map((stream) => {
      const link = stream.creatorProfileId
        ? links.get(stream.creatorProfileId)
        : undefined;
      const minutesWatched = Number(stream.minutesWatched);
      const averageViewers =
        stream.airtimeMinutes > 0
          ? Math.round(minutesWatched / stream.airtimeMinutes)
          : 0;
      return {
        day: stream.date.toISOString().slice(0, 10),
        platform: stream.platform,
        platformUserId: stream.platformUserId,
        name: stream.name,
        slug: link?.slug ?? null,
        avatarUrl: link?.avatarUrl ?? null,
        airtimeMinutes: stream.airtimeMinutes,
        averageViewers,
        // A stream that runs over several days can carry one day's peak
        // only (under 1% of rows): below the average it isn't this day's.
        peakViewers:
          stream.peakViewers !== null && stream.peakViewers >= averageViewers
            ? stream.peakViewers
            : null,
        hoursWatched: Math.round(minutesWatched / 60),
      };
    }),
  };
}
