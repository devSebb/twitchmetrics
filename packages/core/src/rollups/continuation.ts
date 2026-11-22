import {
  gameMinutesForDay,
  utcDayKey,
  type GameMinutes,
  type GameMinutesByDay,
} from "./game-minutes";
import type { RollupFact } from "./types";

/**
 * The days a Twitch 24/7 channel is live but not in the feed yet.
 *
 * Stream Hatchet delivers such a channel as back-to-back 72 h blocks, each
 * starting where the last one ended, and a block only appears in the export
 * of its last day. So after the import of day D the channel's rows stop at
 * the end of its last full block, up to two days short of D: Caedrel's 7D
 * airtime read 5 days 12 h where Stream Hatchet BI, which has live data,
 * shows 7 days (QA 2026-11; 1,453 Twitch channels had such blocks that
 * month). YouTube 24/7 streams are re-sent every day and have no gap.
 *
 * While the next block cannot have been delivered yet, the channel is taken
 * to be still live with the audience of the block before. The daily rebuild
 * of the trailing days then replaces this with the real block, or drops it
 * when no block came. A channel that stopped mid-block is never continued:
 * its last row is shorter than a full block.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BLOCK_MS = 3 * DAY_MS;
/** Blocks are stored as 72 h give or take a minute or two. */
const BLOCK_TOLERANCE_MS = 10 * 60 * 1000;

/** SH platform codes whose 24/7 channels arrive as end-delivered blocks. */
export const CONTINUATION_PLATFORMS: readonly string[] = ["twitch"];

function utcDayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * The block's minutes per game over all its days, repeated for each day of
 * the assumed stream: the rollups split a day by these proportions. Null
 * when the block has none, and the split falls back to its game names.
 */
function carryGameMix(
  block: Pick<RollupFact, "gameMinutesByDay">,
  begins: number,
  ends: number,
): GameMinutesByDay | null {
  const stored = block.gameMinutesByDay;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return null;
  }
  const mix: GameMinutes = {};
  for (const day of Object.keys(stored)) {
    const minutes = gameMinutesForDay(stored, day);
    if (!minutes) continue;
    for (const [game, value] of Object.entries(minutes)) {
      mix[game] = (mix[game] ?? 0) + value;
    }
  }
  if (Object.keys(mix).length === 0) return null;
  const byDay: GameMinutesByDay = {};
  for (let day = utcDayStart(begins); day < ends; day += DAY_MS) {
    byDay[utcDayKey(new Date(day))] = mix;
  }
  return byDay;
}

/** A row that is one full 72 h block of a 24/7 channel. */
export function isFullBlock(
  fact: Pick<RollupFact, "streamBeginsAt" | "streamEndsAt">,
): boolean {
  const span = fact.streamEndsAt.getTime() - fact.streamBeginsAt.getTime();
  return Math.abs(span - BLOCK_MS) <= BLOCK_TOLERANCE_MS;
}

/**
 * Can a block still be undelivered for `dayStart`, given the newest export
 * day imported? Lets the caller skip its queries for every older day.
 */
export function continuationPossible(
  dayStart: Date,
  newestImportedDay: Date,
): boolean {
  // A block is delivered with the export of its third day, so a day is only
  // ever missing while the newest export is less than two days after it.
  return (
    newestImportedDay.getTime() >= dayStart.getTime() &&
    newestImportedDay.getTime() < dayStart.getTime() + 2 * DAY_MS
  );
}

/**
 * The assumed stream that follows `block`, or null when the next block has
 * been (or should have been) delivered. It runs from the block's end to the
 * end of the newest imported day; the rollup builder gives each day its
 * share, like any stream that spans days.
 */
export function continueBlock<T extends RollupFact>(
  block: T,
  newestImportedDay: Date,
): T | null {
  if (!isFullBlock(block)) return null;
  const begins = block.streamBeginsAt.getTime() + BLOCK_MS;
  const deliveredWithDay = utcDayStart(begins + BLOCK_MS - BLOCK_TOLERANCE_MS);
  const coveredUntil = newestImportedDay.getTime() + DAY_MS;
  if (newestImportedDay.getTime() >= deliveredWithDay) return null;
  if (coveredUntil <= begins) return null;

  const airtimeMinutes = Math.round((coveredUntil - begins) / 60_000);
  return {
    ...block,
    streamBeginsAt: new Date(begins),
    streamEndsAt: new Date(coveredUntil),
    airtimeMinutes,
    minutesWatched: BigInt(Math.round(block.averageViewers * airtimeMinutes)),
    // Nothing measured: no views or ranks, and no peak above the average.
    sessionViews: null,
    peakViewers: Math.round(block.averageViewers),
    peakViewersAt: null,
    gameMinutesByDay: carryGameMix(block, begins, coveredUntil),
    bestRank: null,
    averageRank: null,
    worstRank: null,
  };
}

/**
 * Assumed streams for the channels whose newest row is a full block.
 * `latestEndByChannel` is each channel's newest stream end of any length: a
 * channel with a later row (the next block, or a shorter stream after a
 * restart) is not continued.
 */
export function continuationFacts<T extends RollupFact>(
  blocks: T[],
  latestEndByChannel: ReadonlyMap<string, number>,
  newestImportedDay: Date,
): T[] {
  const newestBlock = new Map<string, T>();
  for (const block of blocks) {
    const current = newestBlock.get(block.platformUserId);
    if (
      !current ||
      block.streamEndsAt.getTime() > current.streamEndsAt.getTime()
    ) {
      newestBlock.set(block.platformUserId, block);
    }
  }
  const continued: T[] = [];
  for (const block of newestBlock.values()) {
    const latestEnd = latestEndByChannel.get(block.platformUserId);
    if (latestEnd !== undefined && latestEnd > block.streamEndsAt.getTime()) {
      continue;
    }
    const next = continueBlock(block, newestImportedDay);
    if (next) continued.push(next);
  }
  return continued;
}
