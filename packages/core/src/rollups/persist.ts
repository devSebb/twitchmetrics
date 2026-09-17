import { Prisma, type PrismaClient } from "@twitchmetrics/database";
import { buildRollups } from "./build";
import { buildCreatorRollups, type CreatorRollupFact } from "./creator";
import type { RollupFact } from "./types";

/**
 * Load one partition's facts, rebuild its three rollup tables, write them.
 * Shared by the Inngest S3 import (apps/web) and the local ingest worker, both
 * of which pass their own client — the worker runs its own PrismaClient, and
 * the app uses the shared one.
 */

export type RollupDb = Pick<
  PrismaClient,
  | "streamSessionFact"
  | "channelDailyRollup"
  | "gameDailyRollup"
  | "channelGameDailyRollup"
  | "$transaction"
>;

export type CreatorRollupDb = Pick<
  PrismaClient,
  "streamSessionFact" | "creatorDailyRollup"
>;

/** SH platform codes as stored on facts → our Platform enum values. */
export function internalPlatformForCode(code: string): string | null {
  switch (code) {
    case "twitch":
      return "twitch";
    case "kick":
      return "kick";
    case "yt":
    case "ytg":
      return "youtube";
    default:
      return null;
  }
}

/**
 * Rollup inputs only — selecting the whole row drags rawData/contentLabel JSON
 * for every session (~84k twitch rows a day), which alone blew the step budget.
 */
export const ROLLUP_FACT_SELECT = {
  creatorProfileId: true,
  platformUserId: true,
  platformUsername: true,
  platformDisplayName: true,
  platformLogoUrl: true,
  country: true,
  streamBeginsAt: true,
  streamEndsAt: true,
  peakViewersAt: true,
  primaryGameName: true,
  allGameNames: true,
  airtimeMinutes: true,
  minutesWatched: true,
  sessionViews: true,
  averageViewersGlobal: true,
  peakViewers: true,
  bestRank: true,
  averageRank: true,
  worstRank: true,
} satisfies Prisma.StreamSessionFactSelect;

const WRITE_BATCH = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How far either side of the day to scan for facts that overlap it. A fact's
 * partitionDate is the export day it was seen in; a stream still live at the
 * cut is re-seen (and re-dated) daily, so a long stream always has a row
 * dated within this margin of any day it covers.
 */
const SCAN_MARGIN_DAYS = 30;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size));
  return chunks;
}

export type RecomputeRollupsInput = {
  source: string;
  /** StreamHatchet platform code as stored on the facts: twitch | kick | yt | ytg. */
  platform: string;
  partitionDate: Date;
  matchedOnly: boolean;
  /**
   * Wrap every statement (the long-running local worker retries Neon's
   * "server closed the connection" during multi-hour backfills; the Inngest
   * path does not and just fails the step).
   */
  retry?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The worker writes with skipDuplicates so a retried batch is a no-op. */
  skipDuplicates?: boolean;
};

export async function recomputeRollups(
  db: RollupDb,
  input: RecomputeRollupsInput,
): Promise<{
  channelRollups: number;
  gameRollups: number;
  channelGameRollups: number;
}> {
  const { source, platform, partitionDate, matchedOnly } = input;
  const run = input.retry ?? (<T>(fn: () => Promise<T>) => fn());
  const skipDuplicates = input.skipDuplicates ?? false;

  // Facts are selected by OVERLAP with the day, not by partitionDate: one
  // stream can span days (a 24/7 channel is a single fact for weeks), and the
  // builder attributes each day its own share. partitionDate still bounds the
  // scan so the (platform, partitionDate) index is used — a fact is filed
  // within a few days of the window it was seen in.
  const dayStart = new Date(partitionDate);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const scanFrom = new Date(dayStart.getTime() - SCAN_MARGIN_DAYS * DAY_MS);
  const scanTo = new Date(dayStart.getTime() + SCAN_MARGIN_DAYS * DAY_MS);

  // streamEndsAt asc: the builder takes channel identity and lastStreamAt
  // from the last fact of each group.
  const facts = (await run(() =>
    db.streamSessionFact.findMany({
      where: {
        source,
        platform,
        partitionDate: { gte: scanFrom, lte: scanTo },
        streamBeginsAt: { lt: dayEnd },
        streamEndsAt: { gt: dayStart },
      },
      orderBy: { streamEndsAt: "asc" },
      select: ROLLUP_FACT_SELECT,
    }),
  )) as RollupFact[];

  const where = { source, platform, date: partitionDate };
  await run(() =>
    db.$transaction([
      db.channelDailyRollup.deleteMany({ where }),
      ...(matchedOnly ? [] : [db.gameDailyRollup.deleteMany({ where })]),
      db.channelGameDailyRollup.deleteMany({ where }),
    ]),
  );

  const rollups = buildRollups(facts, {
    source,
    platform,
    date: partitionDate,
    matchedOnly,
  });

  for (const batch of chunk(rollups.channel, WRITE_BATCH)) {
    await run(() =>
      db.channelDailyRollup.createMany({ data: batch, skipDuplicates }),
    );
  }
  for (const batch of chunk(rollups.game, WRITE_BATCH)) {
    await run(() =>
      db.gameDailyRollup.createMany({ data: batch, skipDuplicates }),
    );
  }
  for (const batch of chunk(rollups.channelGame, WRITE_BATCH)) {
    await run(() =>
      db.channelGameDailyRollup.createMany({ data: batch, skipDuplicates }),
    );
  }

  return {
    channelRollups: rollups.channel.length,
    gameRollups: rollups.game.length,
    channelGameRollups: rollups.channelGame.length,
  };
}

/**
 * Rebuild CreatorDailyRollup for one day, across every platform.
 *
 * Runs per DATE, not per (platform, date): a creator's day spans platforms, so
 * this must see all of them at once — call it after the per-platform rollups
 * for that date.
 */
export async function recomputeCreatorRollups(
  db: CreatorRollupDb,
  input: {
    source: string;
    partitionDate: Date;
    retry?: <T>(fn: () => Promise<T>) => Promise<T>;
  },
): Promise<{ creatorRollups: number }> {
  const { source, partitionDate } = input;
  const run = input.retry ?? (<T>(fn: () => Promise<T>) => fn());

  const dayStart = new Date(partitionDate);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const scanFrom = new Date(dayStart.getTime() - SCAN_MARGIN_DAYS * DAY_MS);
  const scanTo = new Date(dayStart.getTime() + SCAN_MARGIN_DAYS * DAY_MS);

  const facts = (await run(() =>
    db.streamSessionFact.findMany({
      where: {
        source,
        creatorProfileId: { not: null },
        partitionDate: { gte: scanFrom, lte: scanTo },
        streamBeginsAt: { lt: dayEnd },
        streamEndsAt: { gt: dayStart },
      },
      select: { ...ROLLUP_FACT_SELECT, platform: true },
    }),
  )) as (RollupFact & { platform: string })[];

  const rows = buildCreatorRollups(
    facts.map(
      (fact): CreatorRollupFact => ({
        ...fact,
        internalPlatform: internalPlatformForCode(fact.platform),
      }),
    ),
    dayStart,
  );

  await run(() =>
    db.creatorDailyRollup.deleteMany({ where: { date: dayStart } }),
  );
  for (const batch of chunk(rows, WRITE_BATCH)) {
    await run(() =>
      db.creatorDailyRollup.createMany({
        data: batch.map((row) => ({
          creatorProfileId: row.creatorProfileId,
          date: row.date,
          uniqueAirtimeMinutes: row.uniqueAirtimeMinutes,
          minutesWatched: row.minutesWatched,
          streamBlocks: row.streamBlocks,
          platforms: row.platforms as never[],
          intervals: row.intervals,
          peakViewers: row.peakViewers,
          peakPlatform: row.peakPlatform as never,
        })),
        skipDuplicates: true,
      }),
    );
  }

  return { creatorRollups: rows.length };
}
