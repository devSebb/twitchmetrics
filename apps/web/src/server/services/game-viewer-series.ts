import type { PrismaClient } from "@twitchmetrics/database";

/**
 * A game's viewers and live channels per platform, one value per 30-minute
 * slot. The game page's header and both of its charts read this one series,
 * so they always agree (QA 2026-11: the header's Twitch average came from
 * Stream Hatchet's daily files, the chart's from Twitch's API, 66.1K against
 * 75.7K on the same page; the charts showed Twitch only).
 *
 * Per platform and slot the value is, in this order:
 *
 * 1. Stream Hatchet's live reading. One call covers Twitch, Kick and YouTube
 *    at the same moment and counts every channel. Its viewers are within a
 *    few percent of the platforms' own APIs (measured over 5,641 slots).
 * 2. The platform's own API reading (Twitch every 30 minutes, Kick hourly).
 *    Their channel counts stop at the top 5,000 streams (Twitch) and the top
 *    100 channels per category (Kick), so a count at that limit is left out
 *    rather than shown low.
 * 3. The reading before, for up to an hour: Kick's hourly reading covers its
 *    hour, and one missed run doesn't dent the total.
 * 4. Zero, when Stream Hatchet's call for the slot kept every game and
 *    didn't list this one: nobody was streaming it there. Without this a
 *    game streamed two hours a day would average only those two hours.
 *
 * YouTube has no reading of its own, so it starts with Stream Hatchet's:
 * 2026-11-04 for the biggest games, and for every game the day all are kept.
 * Until then a call kept the 100 biggest games only, so a smaller game was
 * listed just at its spikes, and averaging those alone reads far too high
 * (Stardew Valley's YouTube: a 3.2K "average" from a few spikes, against 659
 * on Twitch). A game listed in under half of those calls starts with the
 * calls that kept every game.
 */

export const SERIES_PLATFORMS = ["twitch", "kick", "youtube"] as const;
export type SeriesPlatform = (typeof SERIES_PLATFORMS)[number];

export const SLOT_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const LIVE_SOURCE = "streamhatchet_live";
const LIVE_GAMES_JOB = "streamhatchet-live-games-snapshot";

/**
 * Channel counts at or above these came from a capped list. Twitch's reading
 * pages through 5,000 streams and loses a few to duplicates (highest seen:
 * 4,962); Kick's returns 100 channels per category.
 */
const API_CHANNEL_CEILING: Record<SeriesPlatform, number> = {
  twitch: 4_500,
  kick: 100,
  youtube: Number.POSITIVE_INFINITY,
};

export type SeriesReading = {
  platform: SeriesPlatform;
  /** Stream Hatchet's live reading, or the platform's own API. */
  live: boolean;
  at: Date;
  viewers: number;
  channels: number | null;
};

type Values = (number | null)[];

export type GameSeries = {
  /** Slot starts (ISO), every 30 minutes with no holes. */
  slots: string[];
  /** Only platforms with at least one value. */
  viewers: Partial<Record<SeriesPlatform, Values>>;
  channels: Partial<Record<SeriesPlatform, Values>>;
};

function slotOf(date: Date): number {
  return Math.floor(date.getTime() / SLOT_MS) * SLOT_MS;
}

type SlotValue = { viewers: number; channels: number | null };
/**
 * How far a reading is carried: an hourly reading stands for its hour, also
 * when the next one lands a few minutes late and so a slot further on.
 */
const CARRY_SLOTS = 2;

export function buildGameSeries(input: {
  readings: SeriesReading[];
  /** Slots whose Stream Hatchet call kept every game. */
  allGamesSlots?: ReadonlySet<number>;
  /** Slots whose call kept the 100 biggest games only (until 2026-11). */
  topGamesSlots?: ReadonlySet<number>;
  since: Date;
  until: Date;
}): GameSeries {
  const first = slotOf(input.since);
  const last = slotOf(input.until);
  const allGames = (slot: number) => input.allGamesSlots?.has(slot) ?? false;

  const listedInTopGames = new Set<number>();
  for (const reading of input.readings) {
    const slot = slotOf(reading.at);
    if (reading.live && !allGames(slot)) listedInTopGames.add(slot);
  }
  const onlyAtSpikes =
    listedInTopGames.size < (input.topGamesSlots?.size ?? 0) / 2;

  // "platform:slot" -> Stream Hatchet's reading, and the API's
  const live = new Map<string, SlotValue>();
  const api = new Map<string, SlotValue>();
  for (const reading of input.readings) {
    const slot = slotOf(reading.at);
    // Earlier slots are read too, for the carry.
    if (slot < first - CARRY_SLOTS * SLOT_MS || slot > last) continue;
    const key = `${reading.platform}:${slot}`;
    if (reading.live) {
      if (onlyAtSpikes && !allGames(slot)) continue;
      live.set(key, { viewers: reading.viewers, channels: reading.channels });
    } else {
      const capped =
        reading.channels !== null &&
        reading.channels >= API_CHANNEL_CEILING[reading.platform];
      api.set(key, {
        viewers: reading.viewers,
        channels: capped ? null : reading.channels,
      });
    }
  }

  // Viewers and channels are picked separately: an API row whose channel
  // count is capped still gives viewers, and its channels come from the carry.
  const pick = (
    platform: SeriesPlatform,
    slot: number,
    field: keyof SlotValue,
  ): number | null => {
    const key = (back: number) => `${platform}:${slot - back * SLOT_MS}`;
    const now = live.get(key(0))?.[field] ?? api.get(key(0))?.[field];
    if (now != null) return now;
    // The platform's API answers for this game, so Stream Hatchet not
    // listing it is a different spelling, not an empty category.
    let apiKnows = api.has(key(0));
    for (let back = 1; back <= CARRY_SLOTS; back++) {
      apiKnows ||= api.has(key(back));
    }
    for (let back = 0; back <= CARRY_SLOTS; back++) {
      if (back > 0) {
        const earlier = allGames(slot)
          ? api.get(key(back))?.[field]
          : (live.get(key(back))?.[field] ?? api.get(key(back))?.[field]);
        if (earlier != null) return earlier;
      }
      if (allGames(slot - back * SLOT_MS) && !apiKnows) return 0;
    }
    return null;
  };

  const columns = SERIES_PLATFORMS.map((platform) => {
    const viewers: Values = [];
    const channels: Values = [];
    for (let slot = first; slot <= last; slot += SLOT_MS) {
      viewers.push(pick(platform, slot, "viewers"));
      channels.push(pick(platform, slot, "channels"));
    }
    return { platform, viewers, channels };
  });

  // Start at the first slot anything was read, so a game tracked for three
  // days doesn't open a 30-day chart on 27 empty ones.
  const hasValue = (index: number) =>
    columns.some((column) => column.viewers[index] !== null);
  const slotCount = (last - first) / SLOT_MS + 1;
  let start = 0;
  while (start < slotCount && !hasValue(start)) start++;
  let end = slotCount;
  while (end > start && !hasValue(end - 1)) end--;

  const series: GameSeries = { slots: [], viewers: {}, channels: {} };
  for (let index = start; index < end; index++) {
    series.slots.push(new Date(first + index * SLOT_MS).toISOString());
  }
  for (const column of columns) {
    const viewers = column.viewers.slice(start, end);
    if (viewers.every((value) => value === null)) continue;
    series.viewers[column.platform] = viewers;
    const channels = column.channels.slice(start, end);
    if (channels.some((value) => value !== null)) {
      series.channels[column.platform] = channels;
    }
  }
  return series;
}

export type SlotReading = {
  platform: SeriesPlatform;
  source: string;
  bucketStartedAt: Date;
  viewers: number;
  channels: number | null;
};

export type SlotTotals = {
  kickViewers: number;
  kickChannels: number;
  youtubeViewers: number;
  youtubeChannels: number;
  totalViewers: number;
  totalChannels: number;
};

/**
 * All platforms' viewers and channels for the slot the Twitch snapshot just
 * read: what the game lists rank and print (browse, home, search), so a game
 * that is big on Kick or YouTube no longer ranks by its Twitch audience
 * alone. Per platform: Stream Hatchet's newest reading among `recent` (the
 * last hour), else the platform's own.
 */
export function slotTotals(
  twitch: { viewers: number; channels: number },
  recent: SlotReading[],
): SlotTotals {
  const best = new Map<SeriesPlatform, SlotReading>();
  for (const reading of recent) {
    const current = best.get(reading.platform);
    const isLive = reading.source === LIVE_SOURCE;
    const currentIsLive = current?.source === LIVE_SOURCE;
    if (
      !current ||
      (isLive && !currentIsLive) ||
      (isLive === currentIsLive &&
        reading.bucketStartedAt > current.bucketStartedAt)
    ) {
      best.set(reading.platform, reading);
    }
  }
  const twitchLive = best.get("twitch");
  const twitchBest =
    twitchLive?.source === LIVE_SOURCE
      ? {
          viewers: twitchLive.viewers,
          channels: twitchLive.channels ?? twitch.channels,
        }
      : twitch;
  const kick = best.get("kick");
  const youtube = best.get("youtube");
  const totals = {
    kickViewers: kick?.viewers ?? 0,
    kickChannels: kick?.channels ?? 0,
    youtubeViewers: youtube?.viewers ?? 0,
    youtubeChannels: youtube?.channels ?? 0,
  };
  return {
    ...totals,
    totalViewers:
      twitchBest.viewers + totals.kickViewers + totals.youtubeViewers,
    totalChannels:
      twitchBest.channels + totals.kickChannels + totals.youtubeChannels,
  };
}

export type PlatformFigure = {
  platform: SeriesPlatform;
  value: number;
  /** The platform's first slot in the window, when it starts late. */
  since: string | null;
};

export type SeriesFigures = { rows: PlatformFigure[]; total: number };

export type GameSeriesSummary = {
  /** Average over the window per platform; the total is their sum. */
  avgViewers: SeriesFigures;
  avgChannels: SeriesFigures;
  /**
   * Highest slot per platform in the window's last 24 hours. The total is the
   * highest slot of all platforms together, not the sum of the rows: they
   * peak at different moments.
   */
  peakViewers24h: SeriesFigures;
  /** Highest slot of all platforms together, over the whole window. */
  peakViewers: number;
};

function mean(values: Values): number | null {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value === null) continue;
    sum += value;
    count++;
  }
  return count > 0 ? Math.round(sum / count) : null;
}

/** Each slot's sum over the platforms that have a value; null when none has. */
export function columnTotals(
  columns: Partial<Record<SeriesPlatform, Values>>,
  slotCount: number,
): Values {
  const totals: Values = new Array<number | null>(slotCount).fill(null);
  for (const values of Object.values(columns)) {
    values.forEach((value, index) => {
      if (value !== null) totals[index] = (totals[index] ?? 0) + value;
    });
  }
  return totals;
}

function highest(values: Values, from = 0): number {
  let peak = 0;
  for (let index = from; index < values.length; index++) {
    peak = Math.max(peak, values[index] ?? 0);
  }
  return peak;
}

export function summarizeGameSeries(series: GameSeries): GameSeriesSummary {
  const slotCount = series.slots.length;
  // A day's slack: a reading or two missed at the window's edge is not a
  // shorter window worth flagging.
  const lateFrom = DAY_MS / SLOT_MS;
  const dayStart = Math.max(0, slotCount - DAY_MS / SLOT_MS);

  const averages = (
    columns: Partial<Record<SeriesPlatform, Values>>,
  ): SeriesFigures => {
    const rows: PlatformFigure[] = [];
    for (const platform of SERIES_PLATFORMS) {
      const values = columns[platform];
      const value = values ? mean(values) : null;
      if (!values || value === null) continue;
      const firstIndex = values.findIndex((entry) => entry !== null);
      rows.push({
        platform,
        value,
        since: firstIndex >= lateFrom ? series.slots[firstIndex]! : null,
      });
    }
    return { rows, total: rows.reduce((sum, row) => sum + row.value, 0) };
  };

  const peakRows: PlatformFigure[] = [];
  for (const platform of SERIES_PLATFORMS) {
    const values = series.viewers[platform];
    if (!values) continue;
    peakRows.push({ platform, value: highest(values, dayStart), since: null });
  }
  const totals = columnTotals(series.viewers, slotCount);

  return {
    avgViewers: averages(series.viewers),
    avgChannels: averages(series.channels),
    peakViewers24h: { rows: peakRows, total: highest(totals, dayStart) },
    peakViewers: highest(totals),
  };
}

/** The series for the slots from `since` to `until`, both included. */
export async function getGameSeries(
  prisma: PrismaClient,
  input: { gameId: string; since: Date; until: Date },
): Promise<GameSeries> {
  // Earlier slots too, for the carry into the window's first slots.
  const from = new Date(slotOf(input.since) - CARRY_SLOTS * SLOT_MS);
  const [twitch, platformRows, runs] = await Promise.all([
    prisma.gameViewerSnapshot.findMany({
      where: {
        gameId: input.gameId,
        snapshotAt: { gte: from, lte: input.until },
      },
      // Oldest first: of two rows in one slot the later one stays.
      orderBy: { snapshotAt: "asc" },
      select: { snapshotAt: true, twitchViewers: true, twitchChannels: true },
    }),
    prisma.gamePlatformViewerSnapshot.findMany({
      where: {
        gameId: input.gameId,
        platform: { in: [...SERIES_PLATFORMS] },
        source: { in: [LIVE_SOURCE, "kick_api"] },
        bucketStartedAt: { gte: from, lte: input.until },
      },
      select: {
        platform: true,
        source: true,
        bucketStartedAt: true,
        viewers: true,
        channels: true,
      },
    }),
    prisma.ingestionRun.findMany({
      where: {
        jobType: LIVE_GAMES_JOB,
        status: "completed",
        recordsWritten: { gt: 0 },
        startedAt: { gte: from, lte: input.until },
      },
      select: { startedAt: true, metadata: true },
    }),
  ]);

  const readings: SeriesReading[] = twitch.map((row) => ({
    platform: "twitch",
    live: false,
    at: row.snapshotAt,
    viewers: row.twitchViewers,
    channels: row.twitchChannels,
  }));
  for (const row of platformRows) {
    readings.push({
      platform: row.platform as SeriesPlatform,
      live: row.source === LIVE_SOURCE,
      at: row.bucketStartedAt,
      viewers: row.viewers,
      channels: row.channels,
    });
  }

  const allGamesSlots = new Set<number>();
  const topGamesSlots = new Set<number>();
  for (const run of runs) {
    const metadata = run.metadata as { allGames?: unknown } | null;
    (metadata?.allGames === true ? allGamesSlots : topGamesSlots).add(
      slotOf(run.startedAt),
    );
  }

  return buildGameSeries({
    readings,
    allGamesSlots,
    topGamesSlots,
    since: input.since,
    until: input.until,
  });
}
