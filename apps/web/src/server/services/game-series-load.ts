import { Prisma, type PrismaClient } from "@twitchmetrics/database";
import {
  applyGameFile,
  SLOT_MS,
  type GameFileSlot,
  type GameFileSlots,
  dailyAverageKey,
  fillOutageDays,
  getGameSeries,
  outageDays,
  type GameSeries,
  type SeriesPlatform,
} from "@/server/services/game-viewer-series";
import { internalPlatformForStreamHatchet } from "@/server/services/streamhatchet-identity";
import { streamHatchetNamesForGame } from "@/server/services/streamhatchet/game-names";

const MINUTES_PER_DAY = 1440;

/**
 * A game's average viewers per platform on each of `days`, from Stream
 * Hatchet's daily totals: a day's minutes watched over its 1,440 minutes.
 * Keyed by dailyAverageKey. The game's spellings add up, and so do
 * YouTube's two codes (yt, ytg).
 */
async function loadDailyAverages(
  prisma: PrismaClient,
  gameId: string,
  days: string[],
): Promise<Map<string, number>> {
  const dates = days.map((day) => new Date(`${day}T00:00:00Z`));
  const names = await streamHatchetNamesForGame(prisma, gameId, dates[0]!);
  const averages = new Map<string, number>();
  if (names.all.length === 0) return averages;

  const rows = await prisma.$queryRaw<
    { platform: string; date: Date; minutesWatched: bigint }[]
  >(Prisma.sql`
    SELECT platform, date, sum("minutesWatched")::bigint AS "minutesWatched"
    FROM "GameDailyRollup"
    WHERE source = 'streamhatchet'
      AND date = ANY(${dates}::date[])
      AND (
        (platform IN ('twitch', 'kick') AND "gameName" = ANY(${names.all}::text[]))
        OR (platform IN ('yt', 'ytg') AND "gameName" = ANY(${names.youtube}::text[]))
      )
    GROUP BY platform, date
  `);
  for (const row of rows) {
    const platform = internalPlatformForStreamHatchet(row.platform);
    if (!platform) continue;
    const key = dailyAverageKey(
      platform as SeriesPlatform,
      row.date.toISOString().slice(0, 10),
    );
    averages.set(
      key,
      (averages.get(key) ?? 0) +
        Math.round(Number(row.minutesWatched) / MINUTES_PER_DAY),
    );
  }
  return averages;
}

/**
 * Platforms whose slots come from Stream Hatchet's per-minute game file
 * (ShGameMinuteSeries, workers/streamhatchet-profile-game.ts). YouTube waits:
 * its game file and its channel file disagree by about 10 % (164M against
 * 183M hours on 2026-11-24) and Stream Hatchet is checking which one BI uses.
 */
const GAME_FILE_PLATFORMS: Record<string, SeriesPlatform> = {
  twitch: "twitch",
  kick: "kick",
};
const SLOT_MINUTES = SLOT_MS / 60_000;

/**
 * The per-minute file's days inside the window, folded to 30-minute slots in
 * the database (a 30-day window is ~170,000 minute values per platform).
 * A game's spellings add up minute by minute.
 */
async function loadGameFileSlots(
  prisma: PrismaClient,
  input: { gameId: string; since: Date; until: Date },
): Promise<GameFileSlots> {
  const empty: GameFileSlots = { platforms: {}, peakTotals: new Map() };
  const from = new Date(input.since.toISOString().slice(0, 10));
  const names = await streamHatchetNamesForGame(prisma, input.gameId, from);
  if (names.all.length === 0) return empty;

  const rows = await prisma.$queryRaw<
    {
      date: Date;
      slot: number;
      twitchViewers: number;
      twitchChannels: number;
      twitchPeak: number;
      kickViewers: number;
      kickChannels: number;
      kickPeak: number;
      peakTotal: number;
      hasTwitch: boolean;
      hasKick: boolean;
    }[]
  >(Prisma.sql`
    WITH minutes AS (
      SELECT s.date, s."startMinute" + t.i - 1 AS minute,
             sum(t.v) FILTER (WHERE s.platform = 'twitch') AS tw,
             sum(t.c) FILTER (WHERE s.platform = 'twitch') AS twc,
             sum(t.v) FILTER (WHERE s.platform = 'kick') AS kk,
             sum(t.c) FILTER (WHERE s.platform = 'kick') AS kkc
      FROM "ShGameMinuteSeries" s,
           unnest(s.viewers, s.channels) WITH ORDINALITY AS t(v, c, i)
      WHERE s.platform = ANY(${Object.keys(GAME_FILE_PLATFORMS)}::text[])
        AND s."gameName" = ANY(${names.all}::text[])
        AND s.date BETWEEN ${from}::date AND ${input.until}::date
      GROUP BY 1, 2
    ),
    days AS (
      SELECT date, bool_or(tw IS NOT NULL) AS has_twitch,
             bool_or(kk IS NOT NULL) AS has_kick
      FROM minutes GROUP BY 1
    )
    SELECT m.date, (m.minute / ${SLOT_MINUTES}::int)::int AS slot,
           (sum(COALESCE(m.tw, 0)) / ${SLOT_MINUTES}::float8)::float8 AS "twitchViewers",
           (sum(COALESCE(m.twc, 0)) / ${SLOT_MINUTES}::float8)::float8 AS "twitchChannels",
           max(COALESCE(m.tw, 0))::float8 AS "twitchPeak",
           (sum(COALESCE(m.kk, 0)) / ${SLOT_MINUTES}::float8)::float8 AS "kickViewers",
           (sum(COALESCE(m.kkc, 0)) / ${SLOT_MINUTES}::float8)::float8 AS "kickChannels",
           max(COALESCE(m.kk, 0))::float8 AS "kickPeak",
           max(COALESCE(m.tw, 0) + COALESCE(m.kk, 0))::float8 AS "peakTotal",
           d.has_twitch AS "hasTwitch", d.has_kick AS "hasKick"
    FROM minutes m JOIN days d USING (date)
    GROUP BY m.date, 2, d.has_twitch, d.has_kick
  `);
  if (rows.length === 0) return empty;

  const twitch = new Map<number, GameFileSlot>();
  const kick = new Map<number, GameFileSlot>();
  const peakTotals = new Map<number, number>();
  const zero: GameFileSlot = { viewers: 0, channels: 0, peak: 0 };
  // A covered day has all its slots: one the game was not live in is zero.
  const days = new Map<number, { hasTwitch: boolean; hasKick: boolean }>();
  for (const row of rows) {
    days.set(row.date.getTime(), {
      hasTwitch: row.hasTwitch,
      hasKick: row.hasKick,
    });
  }
  for (const [dayStart, has] of days) {
    for (let slot = 0; slot < 1440 / SLOT_MINUTES; slot++) {
      const start = dayStart + slot * SLOT_MS;
      if (has.hasTwitch) twitch.set(start, zero);
      if (has.hasKick) kick.set(start, zero);
      peakTotals.set(start, 0);
    }
  }
  for (const row of rows) {
    const start = row.date.getTime() + row.slot * SLOT_MS;
    if (row.hasTwitch) {
      twitch.set(start, {
        viewers: row.twitchViewers,
        channels: row.twitchChannels,
        peak: row.twitchPeak,
      });
    }
    if (row.hasKick) {
      kick.set(start, {
        viewers: row.kickViewers,
        channels: row.kickChannels,
        peak: row.kickPeak,
      });
    }
    peakTotals.set(start, row.peakTotal);
  }
  return { platforms: { twitch, kick }, peakTotals };
}

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

/**
 * The game page's series: Stream Hatchet's per-minute game file for the days
 * it covers (applyGameFile), our readings for the rest, and the days those
 * mostly failed filled from Stream Hatchet's daily data (fillOutageDays).
 * The daily data is read only when the window holds such a day.
 */
export async function loadGameSeries(
  prisma: PrismaClient,
  input: { gameId: string; since: Date; until: Date },
): Promise<GameSeries> {
  const [readings, file] = await Promise.all([
    getGameSeries(prisma, input),
    loadGameFileSlots(prisma, input),
  ]);
  const series = applyGameFile(readings, file);
  const outage = outageDays(series);
  if (outage.length === 0) return series;
  // The day after too: the jobs came back a few slots into it.
  const days = [
    ...new Set(outage.flatMap((day) => [day, nextDay(day)])),
  ].sort();
  return fillOutageDays(
    series,
    days,
    await loadDailyAverages(prisma, input.gameId, days),
  );
}
