import { Prisma, type PrismaClient } from "@twitchmetrics/database";
import {
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

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

/**
 * The game page's series: our readings, with the days they mostly failed
 * filled from Stream Hatchet's daily data (see fillOutageDays). The daily
 * data is read only when the window holds such a day.
 */
export async function loadGameSeries(
  prisma: PrismaClient,
  input: { gameId: string; since: Date; until: Date },
): Promise<GameSeries> {
  const series = await getGameSeries(prisma, input);
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
