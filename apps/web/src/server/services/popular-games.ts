import type { Platform, PrismaClient } from "@twitchmetrics/database";
import { Prisma } from "@twitchmetrics/database";
import { mergeIntervals, totalMinutes } from "@twitchmetrics/core/rollups";
import {
  gameIdForName,
  indexGamesByName,
  loadGameNameSources,
  normalizePopularGameName,
} from "./streamhatchet/game-names";

export { normalizePopularGameName };

export const POPULAR_GAMES_WINDOW_DAYS = 30;
const SESSION_LOOKBACK_DAYS = 3;

type StreamHatchetPlatform = "kick" | "twitch" | "yt" | "ytg";

type PopularGameContribution = {
  gameName: string;
  twitchGameId?: string | null;
  platform: Platform | null;
  minutesWatched: bigint;
  airtimeMinutes: number;
  sessionCount: number;
  observationCount: number;
  estimated: boolean;
  /** Daily rollup rows only: the UTC day and the channel they describe. */
  dayKey?: string;
  channelKey?: string;
};

/** Minute ranges from 00:00Z of one UTC day. */
type DayIntervals = [number, number][];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A game's airtime on one day across several channels, counting time once.
 *
 * Adding the channels up counts a simulcast twice (TheBurntPeanut's Rob Run
 * on Twitch + Kick: 6.05 days against Stream Hatchet BI's 3.0) and adds a
 * 24/7 rerun channel on top of the live one (HasanAbi's Just Chatting: 34
 * days in a 30-day window). BI's combined view counts the time once.
 *
 * We store how long each channel had the game that day, not when. So each
 * channel's game time is spread evenly over the time it was live, and where
 * channels were live together the larger share counts. Exact when the
 * channels show the same thing or never overlap, an estimate in between;
 * never below the largest channel nor above the plain sum. A channel with no
 * known live time is added in full.
 */
export function overlapFreeGameAirtime(
  channels: { airtimeMinutes: number; live: DayIntervals }[],
): number {
  const sum = channels.reduce((total, c) => total + c.airtimeMinutes, 0);
  if (channels.length < 2) return sum;

  let unplaced = 0;
  const placed: { share: number; live: DayIntervals }[] = [];
  const edges = new Set<number>();
  for (const channel of channels) {
    const live = mergeIntervals(channel.live);
    const liveMinutes = totalMinutes(live);
    if (liveMinutes <= 0) {
      unplaced += channel.airtimeMinutes;
      continue;
    }
    placed.push({
      share: Math.min(1, channel.airtimeMinutes / liveMinutes),
      live,
    });
    for (const [start, end] of live) {
      edges.add(start);
      edges.add(end);
    }
  }

  const sorted = [...edges].sort((a, b) => a - b);
  let total = unplaced;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    let share = 0;
    for (const channel of placed) {
      if (
        channel.share > share &&
        channel.live.some(([from, to]) => from <= start && to >= end)
      ) {
        share = channel.share;
      }
    }
    total += share * (end - start);
  }
  return Math.min(sum, total);
}

/**
 * Live minute ranges per `${dayKey} ${channelKey}` from Stream Hatchet's
 * channel days (ShChannelDaily.intervals: [start, end) minutes of the day).
 */
export function liveIntervalsFromChannelDays(
  days: { channelKey: string; date: Date; intervals: unknown }[],
): Map<string, DayIntervals> {
  const byKey = new Map<string, DayIntervals>();
  for (const day of days) {
    if (!Array.isArray(day.intervals)) continue;
    const live = day.intervals.filter(
      (pair): pair is [number, number] =>
        Array.isArray(pair) &&
        typeof pair[0] === "number" &&
        typeof pair[1] === "number",
    );
    if (live.length === 0) continue;
    byKey.set(`${day.date.toISOString().slice(0, 10)} ${day.channelKey}`, live);
  }
  return byKey;
}

/** Live minute ranges per `${dayKey} ${channelKey}`, split at UTC midnight. */
export function liveIntervalsByDayAndChannel(
  sessions: { channelKey: string; beginsAt: Date; endsAt: Date }[],
): Map<string, DayIntervals> {
  const byKey = new Map<string, DayIntervals>();
  for (const session of sessions) {
    const end = session.endsAt.getTime();
    let cursor = session.beginsAt.getTime();
    while (cursor < end) {
      const dayStart = Math.floor(cursor / DAY_MS) * DAY_MS;
      const sliceEnd = Math.min(end, dayStart + DAY_MS);
      const key = `${new Date(dayStart).toISOString().slice(0, 10)} ${session.channelKey}`;
      const list = byKey.get(key) ?? [];
      list.push([(cursor - dayStart) / 60_000, (sliceEnd - dayStart) / 60_000]);
      byKey.set(key, list);
      cursor = sliceEnd;
    }
  }
  return byKey;
}

/**
 * Scales the daily rollup contributions of a game down to its overlap-free
 * airtime, day by day. Call once names are final, so two spellings of one
 * game on two channels are seen as the same game.
 */
export function removeGameAirtimeOverlap(
  contributions: PopularGameContribution[],
  liveByDayAndChannel: Map<string, DayIntervals>,
): void {
  const groups = new Map<string, PopularGameContribution[]>();
  for (const contribution of contributions) {
    if (!contribution.dayKey || !contribution.channelKey) continue;
    const key = `${contribution.dayKey}\u0000${normalizePopularGameName(contribution.gameName)}`;
    const group = groups.get(key) ?? [];
    group.push(contribution);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const minutesByChannel = new Map<string, number>();
    for (const c of group) {
      minutesByChannel.set(
        c.channelKey!,
        (minutesByChannel.get(c.channelKey!) ?? 0) + c.airtimeMinutes,
      );
    }
    if (minutesByChannel.size < 2) continue;
    const dayKey = group[0]!.dayKey!;
    const sum = group.reduce((total, c) => total + c.airtimeMinutes, 0);
    if (sum <= 0) continue;
    const airtime = overlapFreeGameAirtime(
      [...minutesByChannel].map(([channelKey, airtimeMinutes]) => ({
        airtimeMinutes,
        live: liveByDayAndChannel.get(`${dayKey} ${channelKey}`) ?? [],
      })),
    );
    const factor = airtime / sum;
    for (const c of group) c.airtimeMinutes *= factor;
  }
}

export type RankedPopularGame = {
  gameName: string;
  twitchGameIds: string[];
  minutesWatched: bigint;
  airtimeMinutes: number;
  sessionCount: number;
  observationCount: number;
  measurement: "measured" | "observed" | "mixed";
  platforms: Platform[];
};

export type PopularGame = {
  gameName: string;
  streamCount: number;
  observationCount: number;
  airtimeMinutes: number;
  avgViewers: number;
  measurement: RankedPopularGame["measurement"];
  slug: string | null;
  coverImageUrl: string | null;
  platforms: Platform[];
};

type SnapshotRow = {
  platform: Platform;
  extendedMetrics: unknown;
};

type PopularGamesOptions = {
  creatorProfileId: string;
  limit: number;
  now?: Date;
};

const SUPPORTED_STREAMHATCHET_PLATFORMS: Platform[] = [
  "kick",
  "twitch",
  "youtube",
];

/** Platform codes in Stream Hatchet's profile files (Sh* tables). */
const PROFILE_FILE_PLATFORM: Partial<Record<Platform, string>> = {
  kick: "kick",
  twitch: "twitch",
  youtube: "yt",
};

function streamHatchetPlatforms(platform: Platform): StreamHatchetPlatform[] {
  switch (platform) {
    case "kick":
      return ["kick"];
    case "twitch":
      return ["twitch"];
    case "youtube":
      return ["yt", "ytg"];
    default:
      return [];
  }
}

function internalPlatform(platform: string): Platform | null {
  switch (platform) {
    case "kick":
      return "kick";
    case "twitch":
      return "twitch";
    case "yt":
    case "ytg":
      return "youtube";
    default:
      return null;
  }
}

function asPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function snapshotIsLive(metrics: Record<string, unknown>): boolean {
  if (Object.hasOwn(metrics, "IS_LIVE")) {
    return (
      metrics.IS_LIVE === true ||
      metrics.IS_LIVE === 1 ||
      metrics.IS_LIVE === "1"
    );
  }

  // Older snapshots predate IS_LIVE. A positive live viewer field is the only
  // safe evidence that those observations were captured during a broadcast.
  return (
    asPositiveNumber(metrics.LIVE_VIEWER_COUNT) !== null ||
    asPositiveNumber(metrics.AVG_VIEWERS) !== null
  );
}

export function snapshotToPopularGameContribution(
  snapshot: SnapshotRow,
): PopularGameContribution | null {
  const metrics = snapshot.extendedMetrics as Record<string, unknown> | null;
  if (!metrics || !snapshotIsLive(metrics)) return null;

  const rawName = metrics.CURRENT_GAME;
  const gameName = typeof rawName === "string" ? rawName.trim() : "";
  if (!gameName) return null;

  const viewers =
    asPositiveNumber(metrics.LIVE_VIEWER_COUNT) ??
    asPositiveNumber(metrics.AVG_VIEWERS);
  if (viewers === null) return null;

  const rawTwitchGameId = metrics.CURRENT_GAME_ID;
  const twitchGameId =
    snapshot.platform === "twitch" &&
    typeof rawTwitchGameId === "string" &&
    rawTwitchGameId.trim()
      ? rawTwitchGameId.trim()
      : null;

  // Snapshots do not contain a trustworthy session duration. Treat each live
  // sample as one observed viewer-minute so it contributes to the same
  // audience-consumption score without inventing streams or hours of Air Time.
  return {
    gameName,
    twitchGameId,
    platform: snapshot.platform,
    minutesWatched: BigInt(Math.round(viewers)),
    airtimeMinutes: 1,
    sessionCount: 0,
    observationCount: 1,
    estimated: true,
  };
}

export function rankPopularGameContributions(
  contributions: PopularGameContribution[],
  limit: number,
): RankedPopularGame[] {
  const aggregated = new Map<
    string,
    RankedPopularGame & {
      displayNameScore: bigint;
      hasMeasuredData: boolean;
      hasObservedData: boolean;
      platformSet: Set<Platform>;
      twitchGameIdSet: Set<string>;
    }
  >();

  for (const contribution of contributions) {
    const gameName = contribution.gameName.trim();
    const key = normalizePopularGameName(gameName);
    if (!key) continue;

    const existing = aggregated.get(key);
    if (existing) {
      existing.minutesWatched += contribution.minutesWatched;
      existing.airtimeMinutes += contribution.airtimeMinutes;
      existing.sessionCount += contribution.sessionCount;
      existing.observationCount += contribution.observationCount;
      existing.hasMeasuredData ||= !contribution.estimated;
      existing.hasObservedData ||= contribution.estimated;
      if (contribution.platform) {
        existing.platformSet.add(contribution.platform);
      }
      if (contribution.twitchGameId) {
        existing.twitchGameIdSet.add(contribution.twitchGameId);
      }
      if (
        contribution.minutesWatched > existing.displayNameScore ||
        (contribution.minutesWatched === existing.displayNameScore &&
          gameName.localeCompare(existing.gameName) < 0)
      ) {
        existing.gameName = gameName;
        existing.displayNameScore = contribution.minutesWatched;
      }
      continue;
    }

    aggregated.set(key, {
      gameName,
      twitchGameIds: [],
      minutesWatched: contribution.minutesWatched,
      airtimeMinutes: contribution.airtimeMinutes,
      sessionCount: contribution.sessionCount,
      observationCount: contribution.observationCount,
      measurement: contribution.estimated ? "observed" : "measured",
      platforms: [],
      displayNameScore: contribution.minutesWatched,
      hasMeasuredData: !contribution.estimated,
      hasObservedData: contribution.estimated,
      platformSet: contribution.platform
        ? new Set([contribution.platform])
        : new Set(),
      twitchGameIdSet: contribution.twitchGameId
        ? new Set([contribution.twitchGameId])
        : new Set(),
    });
  }

  return (
    [...aggregated.values()]
      .map(
        (game): RankedPopularGame => ({
          gameName: game.gameName,
          twitchGameIds: [...game.twitchGameIdSet].sort(),
          minutesWatched: game.minutesWatched,
          // Overlap removal leaves fractions of a minute.
          airtimeMinutes: Math.round(game.airtimeMinutes),
          sessionCount: game.sessionCount,
          observationCount: game.observationCount,
          measurement:
            game.hasMeasuredData && game.hasObservedData
              ? "mixed"
              : game.hasObservedData
                ? "observed"
                : "measured",
          platforms: [...game.platformSet].sort(),
        }),
      )
      // Ranked by hours streamed (Air Time), matching Stream Hatchet's channel
      // view; watch time breaks ties. Observation-only games carry a live-sample
      // COUNT in airtimeMinutes (1 per sample), not real minutes, so they can
      // never outrank a game with measured airtime — they sort after it.
      .sort((left, right) => {
        const leftMeasured = left.measurement !== "observed";
        const rightMeasured = right.measurement !== "observed";
        if (leftMeasured !== rightMeasured) return leftMeasured ? -1 : 1;
        if (left.airtimeMinutes !== right.airtimeMinutes) {
          return right.airtimeMinutes - left.airtimeMinutes;
        }
        if (left.minutesWatched !== right.minutesWatched) {
          return left.minutesWatched > right.minutesWatched ? -1 : 1;
        }
        if (left.sessionCount !== right.sessionCount) {
          return right.sessionCount - left.sessionCount;
        }
        return normalizePopularGameName(left.gameName).localeCompare(
          normalizePopularGameName(right.gameName),
        );
      })
      .slice(0, limit)
  );
}

export function popularGamesWindowStart(now: Date): Date {
  return new Date(
    now.getTime() - POPULAR_GAMES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

/**
 * The UTC days from the day of `since` up to today: the days `date >= since`
 * matches on a date column (Prisma compares the day, not the time).
 */
function daysSince(since: Date, now = new Date()): Date[] {
  const days: Date[] = [];
  for (
    let day = Math.floor(since.getTime() / DAY_MS) * DAY_MS;
    day <= now.getTime();
    day += DAY_MS
  ) {
    days.push(new Date(day));
  }
  return days;
}

export async function getPopularGames(
  prisma: PrismaClient,
  options: PopularGamesOptions,
): Promise<PopularGame[]> {
  const since = popularGamesWindowStart(options.now ?? new Date());
  const accounts = await prisma.platformAccount.findMany({
    where: {
      creatorProfileId: options.creatorProfileId,
      platform: { in: SUPPORTED_STREAMHATCHET_PLATFORMS },
    },
    select: {
      platform: true,
      platformUserId: true,
    },
  });

  const rollupIdentities: Prisma.ChannelGameDailyRollupWhereInput[] = [];
  const sessionIdentities: Prisma.StreamSessionFactWhereInput[] = [];
  const fileIdentities: { platform: string; platformUserId: string }[] = [];
  for (const account of accounts) {
    const filePlatform = PROFILE_FILE_PLATFORM[account.platform];
    if (filePlatform) {
      fileIdentities.push({
        platform: filePlatform,
        platformUserId: account.platformUserId,
      });
    }
    for (const platform of streamHatchetPlatforms(account.platform)) {
      rollupIdentities.push({
        platform,
        platformUserId: account.platformUserId,
      });
      sessionIdentities.push({
        platform,
        platformUserId: account.platformUserId,
      });
    }
  }

  // The days are listed, not given as a range: the tables are indexed by
  // (platform, date, channel), and a range made Postgres walk every channel
  // of the 30 days (56 s cold for one creator, 40 ms with the list).
  const fileWhere = {
    date: { in: daysSince(since) },
    OR: [{ creatorProfileId: options.creatorProfileId }, ...fileIdentities],
  };
  const [fileRows, fileDays, rollups, sessions, snapshots] = await Promise.all([
    prisma.shChannelGameDaily.findMany({
      where: fileWhere,
      select: {
        platform: true,
        platformUserId: true,
        date: true,
        gameName: true,
        airtimeMinutes: true,
        minutesWatched: true,
      },
    }),
    prisma.shChannelDaily.findMany({
      where: fileWhere,
      select: {
        platform: true,
        platformUserId: true,
        date: true,
        intervals: true,
      },
    }),
    prisma.channelGameDailyRollup.findMany({
      where: {
        date: { gte: since },
        OR: [
          { creatorProfileId: options.creatorProfileId },
          ...rollupIdentities,
        ],
      },
      select: {
        platform: true,
        platformUserId: true,
        date: true,
        gameName: true,
        sessionCount: true,
        airtimeMinutes: true,
        minutesWatched: true,
      },
    }),
    prisma.streamSessionFact.findMany({
      where: {
        // A few days earlier than the window: a stream that began before it
        // can still be live inside it (Twitch streams run up to 48 h), and
        // its live time is needed to remove overlap below.
        streamBeginsAt: {
          gte: new Date(since.getTime() - SESSION_LOOKBACK_DAYS * DAY_MS),
        },
        OR: [
          { creatorProfileId: options.creatorProfileId },
          ...sessionIdentities,
        ],
      },
      select: {
        platform: true,
        platformUserId: true,
        streamBeginsAt: true,
        streamEndsAt: true,
        primaryGameName: true,
        airtimeMinutes: true,
        minutesWatched: true,
      },
    }),
    prisma.metricSnapshot.findMany({
      where: {
        creatorProfileId: options.creatorProfileId,
        snapshotAt: { gte: since },
        extendedMetrics: { not: Prisma.DbNull },
      },
      select: {
        platform: true,
        extendedMetrics: true,
      },
    }),
  ]);

  // Prefer the strongest available source per platform. This prevents the
  // profile files, daily rollups, session facts, and snapshots from counting
  // the same broadcast. Stream Hatchet's channel and game file comes first:
  // it holds each game's own minutes, where the rollups split a stream's time
  // between its games.
  const filePlatforms = new Set<Platform>();
  const contributions: PopularGameContribution[] = fileRows.flatMap((row) => {
    const platform = internalPlatform(row.platform);
    if (!platform) return [];
    filePlatforms.add(platform);
    if (!row.gameName.trim()) return [];
    return [
      {
        gameName: row.gameName,
        platform,
        minutesWatched: row.minutesWatched,
        airtimeMinutes: row.airtimeMinutes,
        // The file counts minutes per day, not streams.
        sessionCount: 0,
        observationCount: 0,
        estimated: false,
        dayKey: row.date.toISOString().slice(0, 10),
        channelKey: `${platform}:${row.platformUserId}`,
      },
    ];
  });

  const rollupPlatforms = new Set<Platform>(filePlatforms);
  for (const rollup of rollups) {
    const platform = internalPlatform(rollup.platform);
    if (platform && filePlatforms.has(platform)) continue;
    if (platform) rollupPlatforms.add(platform);
    if (!rollup.gameName.trim()) continue;
    contributions.push({
      gameName: rollup.gameName,
      platform,
      minutesWatched: rollup.minutesWatched,
      airtimeMinutes: rollup.airtimeMinutes,
      sessionCount: rollup.sessionCount,
      observationCount: 0,
      estimated: false,
      dayKey: rollup.date.toISOString().slice(0, 10),
      // "yt" and "ytg" rows of one YouTube channel are one channel.
      channelKey: `${platform ?? rollup.platform}:${rollup.platformUserId}`,
    });
  }

  const sessionPlatforms = new Set<Platform>();
  for (const session of sessions) {
    const platform = internalPlatform(session.platform);
    if (!platform || rollupPlatforms.has(platform)) continue;
    if (session.streamBeginsAt < since) continue;
    const gameName = session.primaryGameName?.trim();
    if (!gameName) continue;
    sessionPlatforms.add(platform);
    contributions.push({
      gameName,
      platform,
      minutesWatched: session.minutesWatched,
      airtimeMinutes: session.airtimeMinutes,
      sessionCount: 1,
      observationCount: 0,
      estimated: false,
    });
  }

  for (const snapshot of snapshots) {
    if (
      rollupPlatforms.has(snapshot.platform) ||
      sessionPlatforms.has(snapshot.platform)
    ) {
      continue;
    }
    const contribution = snapshotToPopularGameContribution(snapshot);
    if (contribution) contributions.push(contribution);
  }

  // SH files one game under several names (its own, the catalog's, the
  // spelling before a rename): name each contribution after the catalog game
  // it resolves to, so they rank as one row and link to the game page.
  const sources = await loadGameNameSources(prisma);
  const index = indexGamesByName(sources.games, sources.aliases);
  const catalogNameById = new Map(sources.games.map((g) => [g.id, g.name]));
  for (const contribution of contributions) {
    const gameId = gameIdForName(
      index,
      contribution.gameName,
      contribution.platform ?? "",
    );
    const catalogName = gameId ? catalogNameById.get(gameId) : undefined;
    if (catalogName) contribution.gameName = catalogName.trim();
  }

  // When each channel was live: from the file where it has the day (to the
  // minute), from the sessions otherwise.
  const live = liveIntervalsByDayAndChannel(
    sessions.map((session) => ({
      channelKey: `${internalPlatform(session.platform) ?? session.platform}:${session.platformUserId}`,
      beginsAt: session.streamBeginsAt,
      endsAt: session.streamEndsAt,
    })),
  );
  const fileLive = liveIntervalsFromChannelDays(
    fileDays.map((day) => ({
      channelKey: `${internalPlatform(day.platform) ?? day.platform}:${day.platformUserId}`,
      date: day.date,
      intervals: day.intervals,
    })),
  );
  for (const [key, intervals] of fileLive) live.set(key, intervals);
  removeGameAirtimeOverlap(contributions, live);

  const ranked = rankPopularGameContributions(contributions, options.limit);
  if (ranked.length === 0) return [];

  const twitchGameIds = ranked.flatMap((game) => game.twitchGameIds);
  const games = await prisma.game.findMany({
    where: {
      OR: [
        ...(twitchGameIds.length > 0
          ? [{ twitchGameId: { in: twitchGameIds } }]
          : []),
        ...ranked.map((game) => ({
          name: {
            equals: normalizePopularGameName(game.gameName),
            mode: "insensitive" as const,
          },
        })),
      ],
    },
    select: {
      name: true,
      slug: true,
      coverImageUrl: true,
      twitchGameId: true,
    },
  });

  const gameByTwitchId = new Map(
    games.flatMap((game) =>
      game.twitchGameId ? [[game.twitchGameId, game] as const] : [],
    ),
  );
  const gameByName = new Map(
    games.map((game) => [normalizePopularGameName(game.name), game] as const),
  );

  return ranked.map((game) => {
    const catalogGame =
      game.twitchGameIds
        .map((id) => gameByTwitchId.get(id))
        .find((candidate) => candidate !== undefined) ??
      gameByName.get(normalizePopularGameName(game.gameName));
    return {
      gameName: game.gameName,
      streamCount: game.sessionCount,
      observationCount: game.observationCount,
      airtimeMinutes: game.airtimeMinutes,
      avgViewers:
        game.airtimeMinutes > 0
          ? Math.round(Number(game.minutesWatched) / game.airtimeMinutes)
          : 0,
      measurement: game.measurement,
      slug: catalogGame?.slug ?? null,
      coverImageUrl: catalogGame?.coverImageUrl ?? null,
      platforms: game.platforms,
    };
  });
}
