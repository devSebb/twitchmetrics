/**
 * Interim YouTube game viewership, derived from the Stream Hatchet daily
 * rollups (C23).
 *
 * `streamhatchet-live-games-snapshot` has never returned a row — the quota
 * rejects it — so every game page shows Twitch and Kick viewership and nothing
 * for YouTube. `GameDailyRollup` already holds a per-game daily total for
 * platform `yt`, which is enough for a daily average while the live feed stays
 * unavailable.
 *
 * These numbers are a DAY'S AVERAGE, not a live reading: a rollup covers 1440
 * minutes, so `minutesWatched / 1440` is the average concurrent audience and
 * `airtimeMinutes / 1440` the average number of channels live at once. They are
 * written with source `streamhatchet_daily`, which every live source outranks
 * (see sourcePriority in game-platform-metrics.ts), so a real YouTube feed
 * replaces them the moment one exists.
 *
 * Depends on C26: before the dedupe and recompute, YouTube watch time was
 * inflated ~109 %, which would have published roughly double the real audience.
 */
import { Platform, prisma } from "@twitchmetrics/database";
import { normalizePopularGameName } from "@/server/services/popular-games";

/** A rollup covers a whole day, so a daily total divides down to a concurrent average. */
const MINUTES_PER_DAY = 1440;

export const DAILY_GAME_SNAPSHOT_SOURCE = "streamhatchet_daily";

export type DailyGameRollupInput = {
  gameName: string;
  airtimeMinutes: number;
  minutesWatched: bigint | number;
};

export type DailyGameSnapshotValues = {
  viewers: number;
  channels: number;
};

/**
 * Average concurrent viewers and channels implied by one day's totals.
 * Pure, so the arithmetic is testable without a database.
 */
export function dailyGameSnapshotValues(
  rollup: DailyGameRollupInput,
): DailyGameSnapshotValues {
  return {
    viewers: Math.round(Number(rollup.minutesWatched) / MINUTES_PER_DAY),
    channels: Math.round(rollup.airtimeMinutes / MINUTES_PER_DAY),
  };
}

/**
 * Index games by their normalised name, so rollup names (which come from the
 * export, with whatever spacing and case it used) resolve to a game id.
 * The catalog is ~1,200 rows, so one full read beats a query per name.
 */
export function indexGamesByName(
  games: { id: string; name: string }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const game of games) {
    const key = normalizePopularGameName(game.name);
    // First writer wins: two catalog rows normalising to one name would
    // otherwise flip between imports.
    if (!index.has(key)) index.set(key, game.id);
  }
  return index;
}

export type WriteDailyGamePlatformSnapshotsResult = {
  date: string;
  rollups: number;
  matched: number;
  written: number;
};

/** Upserts run in waves rather than one at a time; the table is tiny. */
const UPSERT_CONCURRENCY = 25;

/**
 * Turn one date's YouTube game rollups into GamePlatformViewerSnapshot rows.
 * Idempotent: the unique key is (gameId, platform, source, bucketStartedAt) and
 * bucketStartedAt is the date's midnight, so re-running a date overwrites it.
 */
export async function writeDailyGamePlatformSnapshots(input: {
  date: Date;
  source?: string;
}): Promise<WriteDailyGamePlatformSnapshotsResult> {
  const bucketStartedAt = new Date(input.date);
  bucketStartedAt.setUTCHours(0, 0, 0, 0);

  const rollups = await prisma.gameDailyRollup.findMany({
    where: {
      source: input.source ?? "streamhatchet",
      platform: "yt",
      date: bucketStartedAt,
    },
    select: { gameName: true, airtimeMinutes: true, minutesWatched: true },
  });

  if (rollups.length === 0) {
    return {
      date: bucketStartedAt.toISOString().slice(0, 10),
      rollups: 0,
      matched: 0,
      written: 0,
    };
  }

  const games = await prisma.game.findMany({
    select: { id: true, name: true },
  });
  const gameIdByName = indexGamesByName(games);

  type PendingSnapshot = {
    gameId: string;
    gameName: string;
  } & DailyGameSnapshotValues;

  const pending: PendingSnapshot[] = [];

  for (const rollup of rollups) {
    const gameId = gameIdByName.get(normalizePopularGameName(rollup.gameName));
    if (!gameId) continue;

    const values = dailyGameSnapshotValues(rollup);
    // A game with a handful of viewer-minutes rounds to zero; the KPI card
    // drops zero rows anyway, so there is nothing to store.
    if (values.viewers <= 0) continue;

    pending.push({ gameId, gameName: rollup.gameName, ...values });
  }

  let written = 0;
  for (let i = 0; i < pending.length; i += UPSERT_CONCURRENCY) {
    const wave = pending.slice(i, i + UPSERT_CONCURRENCY);
    await Promise.all(
      wave.map((row) =>
        prisma.gamePlatformViewerSnapshot.upsert({
          where: {
            gameId_platform_source_bucketStartedAt: {
              gameId: row.gameId,
              platform: Platform.youtube,
              source: DAILY_GAME_SNAPSHOT_SOURCE,
              bucketStartedAt,
            },
          },
          create: {
            gameId: row.gameId,
            platform: Platform.youtube,
            source: DAILY_GAME_SNAPSHOT_SOURCE,
            platformGameName: row.gameName,
            bucketStartedAt,
            snapshotAt: bucketStartedAt,
            viewers: row.viewers,
            channels: row.channels,
          },
          update: {
            platformGameName: row.gameName,
            snapshotAt: bucketStartedAt,
            viewers: row.viewers,
            channels: row.channels,
          },
        }),
      ),
    );
    written += wave.length;
  }

  return {
    date: bucketStartedAt.toISOString().slice(0, 10),
    rollups: rollups.length,
    matched: pending.length,
    written,
  };
}
