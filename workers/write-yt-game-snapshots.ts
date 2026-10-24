/**
 * Rebuild the YouTube per-game daily averages (GamePlatformViewerSnapshot,
 * source streamhatchet_daily) from the yt GameDailyRollup for a date range.
 *
 * The daily GitHub workflow (.github/workflows/sh-daily-sessions.yml) runs
 * this for its window, after the yt rollups. Run it by hand after a change to
 * how SH game names match catalog games, so the days already written are
 * redone — it also removes rows the old matching wrote for games that no
 * longer match (the 2026-10 "Sports" rows).
 *
 * Options:
 *   --days N                      the N days ending yesterday UTC (default 7)
 *   --start-date / --end-date     YYYY-MM-DD, instead of --days
 *   --write                       without it, only counts the rollups per day
 *
 * Usage: npx tsx --env-file=apps/web/.env.local workers/write-yt-game-snapshots.ts --days 7 --write
 */
import { prisma } from "@twitchmetrics/database";
import { writeDailyGamePlatformSnapshots } from "../apps/web/src/server/services/streamhatchet/daily-game-platform";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const WRITE = args.includes("--write");
const DAY_MS = 86_400_000;

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date '${value}'. Use YYYY-MM-DD.`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function dates(): Date[] {
  const start = argValue("--start-date");
  const end = argValue("--end-date");
  if (start && end) {
    const out: Date[] = [];
    for (
      let t = parseDate(start).getTime();
      t <= parseDate(end).getTime();
      t += DAY_MS
    ) {
      out.push(new Date(t));
    }
    return out;
  }
  const days = Number.parseInt(argValue("--days") ?? "7", 10) || 7;
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return Array.from(
    { length: days },
    (_, i) => new Date(yesterday.getTime() - (days - 1 - i) * DAY_MS),
  );
}

async function main() {
  for (const date of dates()) {
    const day = date.toISOString().slice(0, 10);
    if (!WRITE) {
      const rollups = await prisma.gameDailyRollup.count({
        where: { source: "streamhatchet", platform: "yt", date },
      });
      console.log(`${day}: would rebuild from ${rollups} yt game rollups`);
      continue;
    }
    console.log(
      JSON.stringify(await writeDailyGamePlatformSnapshots({ date })),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
