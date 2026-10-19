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
// Relative, not "@/": workers/write-yt-game-snapshots.ts imports this file.
import { normalizePopularGameName } from "../popular-games";

/** A rollup covers a whole day, so a daily total divides down to a concurrent average. */
const MINUTES_PER_DAY = 1440;

export const DAILY_GAME_SNAPSHOT_SOURCE = "streamhatchet_daily";

/**
 * YouTube's own video categories. SH files a YouTube stream under one when it
 * has no game, so these are whole slices of YouTube, not games: "Sports" (every
 * sports broadcast, ~440k average viewers) landed on the Twitch "Sports"
 * category and multiplied it 40x (QA 2026-10). Never matched to a game.
 */
const YOUTUBE_VIDEO_CATEGORIES = new Set(
  [
    "Autos & Vehicles",
    "Animals",
    "Pets & Animals",
    "Comedy",
    "Education",
    "Entertainment",
    "Film & Animation",
    "Gaming",
    "Howto & Style",
    "Movies",
    "Music",
    "News & Politics",
    "Nonprofits & Activism",
    "People",
    "People & Blogs",
    "Science & Technology",
    "Shows",
    "Sports",
    "Trailers",
    "Travel",
    "Travel & Events",
  ].map(normalizePopularGameName),
);

export function isYouTubeVideoCategory(name: string): boolean {
  return YOUTUBE_VIDEO_CATEGORIES.has(normalizePopularGameName(name));
}

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
 *
 * `aliases` are names Stream Hatchet's game discovery already tied to a
 * catalog game: SH files CS2 as "Counter-Strike" and Overwatch 2 as
 * "Overwatch", which the catalog name alone never matched. A catalog name
 * always wins over an alias, and an alias claimed by two games is dropped.
 */
export function indexGamesByName(
  games: { id: string; name: string }[],
  aliases: { name: string; gameId: string }[] = [],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const game of games) {
    const key = normalizePopularGameName(game.name);
    // First writer wins: two catalog rows normalising to one name would
    // otherwise flip between imports.
    if (!index.has(key)) index.set(key, game.id);
  }

  const aliasIndex = new Map<string, string | null>();
  for (const alias of aliases) {
    const key = normalizePopularGameName(alias.name);
    if (index.has(key)) continue;
    const existing = aliasIndex.get(key);
    if (existing === undefined) aliasIndex.set(key, alias.gameId);
    else if (existing !== alias.gameId) aliasIndex.set(key, null);
  }
  for (const [key, gameId] of aliasIndex) {
    if (gameId) index.set(key, gameId);
  }

  for (const key of YOUTUBE_VIDEO_CATEGORIES) index.delete(key);
  return index;
}

export type WriteDailyGamePlatformSnapshotsResult = {
  date: string;
  rollups: number;
  matched: number;
  written: number;
  removed: number;
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
  computedAt?: Date;
}): Promise<WriteDailyGamePlatformSnapshotsResult> {
  const bucketStartedAt = new Date(input.date);
  bucketStartedAt.setUTCHours(0, 0, 0, 0);
  const computedAt = input.computedAt ?? new Date();

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
      removed: 0,
    };
  }

  const [games, discoveryMappings] = await Promise.all([
    prisma.game.findMany({ select: { id: true, name: true } }),
    prisma.platformGameMapping.findMany({
      where: { source: "streamhatchet_discovery" },
      select: { platformGameName: true, gameId: true },
    }),
  ]);
  const gameIdByName = indexGamesByName(
    games,
    discoveryMappings.map((mapping) => ({
      name: mapping.platformGameName,
      gameId: mapping.gameId,
    })),
  );

  type PendingSnapshot = {
    gameId: string;
    gameName: string;
  } & DailyGameSnapshotValues;

  // Several SH names can resolve to one game ("Counter-Strike" and
  // "Counter-Strike 2"): their minutes add up, and the row is named after the
  // biggest. One row per game also keeps two upserts off the same key.
  const byGame = new Map<
    string,
    { gameName: string; top: bigint; airtime: number; watched: bigint }
  >();
  for (const rollup of rollups) {
    const gameId = gameIdByName.get(normalizePopularGameName(rollup.gameName));
    if (!gameId) continue;
    const watched = BigInt(rollup.minutesWatched);
    const existing = byGame.get(gameId);
    if (!existing) {
      byGame.set(gameId, {
        gameName: rollup.gameName,
        top: watched,
        airtime: rollup.airtimeMinutes,
        watched,
      });
      continue;
    }
    existing.airtime += rollup.airtimeMinutes;
    existing.watched += watched;
    if (watched > existing.top) {
      existing.top = watched;
      existing.gameName = rollup.gameName;
    }
  }

  const pending: PendingSnapshot[] = [];
  for (const [gameId, total] of byGame) {
    const values = dailyGameSnapshotValues({
      gameName: total.gameName,
      airtimeMinutes: total.airtime,
      minutesWatched: total.watched,
    });
    // A game with a handful of viewer-minutes rounds to zero; the KPI card
    // drops zero rows anyway, so there is nothing to store.
    if (values.viewers <= 0) continue;

    pending.push({ gameId, gameName: total.gameName, ...values });
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
            // When we computed it, not the day it covers — bucketStartedAt
            // already records that, and the reader needs both.
            snapshotAt: computedAt,
            viewers: row.viewers,
            channels: row.channels,
          },
          update: {
            platformGameName: row.gameName,
            snapshotAt: computedAt,
            viewers: row.viewers,
            channels: row.channels,
          },
        }),
      ),
    );
    written += wave.length;
  }

  // A rerun after a matching fix must also take back what the old matching
  // wrote — the 440k-viewer "Sports" rows were only ever wrong.
  const removed = await prisma.gamePlatformViewerSnapshot.deleteMany({
    where: {
      platform: Platform.youtube,
      source: DAILY_GAME_SNAPSHOT_SOURCE,
      bucketStartedAt,
      gameId: { notIn: pending.map((row) => row.gameId) },
    },
  });

  return {
    date: bucketStartedAt.toISOString().slice(0, 10),
    rollups: rollups.length,
    matched: pending.length,
    written,
    removed: removed.count,
  };
}
