import type {
  BuiltRollups,
  ChannelGameRollupRow,
  ChannelRollupRow,
  GameRollupRow,
  RollupContext,
  RollupFact,
} from "./types";
import {
  gameMinutesForDay,
  namedGameMinutes,
  splitByWeights,
  utcDayKey,
} from "./game-minutes";

/**
 * The daily rollup grouping, as one pure function.
 *
 * It lived twice — in apps/web's streamhatchet/daily-sessions.ts and, copied,
 * in workers/streamhatchet-ingest.ts — so every change to rollup semantics had
 * to be made in both or they drifted. Both now call this.
 *
 * Callers pass facts for ONE (source, platform, date) partition, ordered by
 * streamEndsAt asc: several rollup fields ("latest" channel identity,
 * lastStreamAt) take the last session of a group.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Minutes of `fact` inside the UTC day starting at `dayStart`, and the share
 * of the whole stream that represents.
 *
 * A fact can span days: with the C26 identity a 24/7 channel is ONE fact for
 * weeks, and any stream crossing midnight belongs partly to each day. Before
 * this, a whole multi-day session was credited to one partitionDate (Gaules:
 * 4,319 minutes on 2026-09-04), so every window filter was wrong.
 */
export function dayOverlap(
  fact: Pick<RollupFact, "streamBeginsAt" | "streamEndsAt">,
  dayStart: Date,
): { minutes: number; fraction: number } {
  const dayEnd = dayStart.getTime() + DAY_MS;
  const begins = fact.streamBeginsAt.getTime();
  const ends = fact.streamEndsAt.getTime();
  const spanMs = Math.max(0, ends - begins);
  const overlapMs = Math.max(
    0,
    Math.min(ends, dayEnd) - Math.max(begins, dayStart.getTime()),
  );
  if (overlapMs <= 0) {
    // A zero-length stream stamped inside the day still belongs to it.
    const touchesDay = begins >= dayStart.getTime() && begins < dayEnd;
    return spanMs === 0 && touchesDay
      ? { minutes: 0, fraction: 1 }
      : { minutes: 0, fraction: 0 };
  }
  return {
    minutes: overlapMs / 60_000,
    fraction: spanMs > 0 ? overlapMs / spanMs : 1,
  };
}

/** Every category a session played: primary game first, then allGameNames. */
export function categoriesOf(
  fact: Pick<RollupFact, "primaryGameName" | "allGameNames">,
): string[] {
  const seen = new Map<string, string>();
  for (const name of [fact.primaryGameName, ...fact.allGameNames]) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    // Case variants of one game are one category; first spelling wins.
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()];
}

/**
 * Split `total` into `parts` integer shares summing back to `total` exactly
 * (largest-remainder). The rollup airtime columns are Int, so a plain
 * total/n per category would lose or invent minutes.
 */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const shares = new Array<number>(parts).fill(base);
  let remainder = total - base * parts;
  for (let i = 0; remainder > 0 && i < parts; i++, remainder--)
    shares[i] = (shares[i] ?? 0) + 1;
  return shares;
}

export function weightedAverage(
  weightedValues: Array<{ value: number | null; weight: number }>,
): number | null {
  const usable = weightedValues.filter(
    (item) => item.value !== null && item.weight > 0,
  ) as Array<{ value: number; weight: number }>;
  if (usable.length === 0) return null;
  const weight = usable.reduce((sum, item) => sum + item.weight, 0);
  return (
    usable.reduce((sum, item) => sum + item.value * item.weight, 0) / weight
  );
}

/** The channel's headline game for the day: most watch time, ties by name. */
export function mostWatchedGame(facts: RollupFact[]): string | null {
  const totals = new Map<string, bigint>();
  for (const fact of facts) {
    if (!fact.primaryGameName) continue;
    totals.set(
      fact.primaryGameName,
      (totals.get(fact.primaryGameName) ?? 0n) + fact.minutesWatched,
    );
  }
  return (
    [...totals.entries()].sort((a, b) =>
      a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] > b[1] ? -1 : 1,
    )[0]?.[0] ?? null
  );
}

function sumMinutesWatched(facts: RollupFact[]): bigint {
  return facts.reduce((sum, fact) => sum + fact.minutesWatched, 0n);
}

function sumAirtime(facts: RollupFact[]): number {
  return facts.reduce((sum, fact) => sum + fact.airtimeMinutes, 0);
}

function peakFact(facts: RollupFact[]): RollupFact | null {
  return facts.reduce<RollupFact | null>(
    (best, fact) =>
      best === null || fact.peakViewers > best.peakViewers ? fact : best,
    null,
  );
}

function averageViewers(
  minutesWatched: bigint,
  airtimeMinutes: number,
): number | null {
  return airtimeMinutes > 0 ? Number(minutesWatched) / airtimeMinutes : null;
}

type GameShare = {
  gameName: string;
  airtimeMinutes: number;
  minutesWatched: bigint;
};

/**
 * One fact's day slice, split by game. `daySlice` already holds the day's
 * airtime/watch time; `rawFact` carries the stored per-game minutes.
 */
export function splitFactByGame(
  daySlice: RollupFact,
  rawFact: RollupFact,
  dayKey: string,
): GameShare[] {
  const minutes = gameMinutesForDay(rawFact.gameMinutesByDay, dayKey);
  if (minutes) {
    const { games, noGameMinutes } = namedGameMinutes(minutes);
    const weights = [...games.map((g) => g.minutes), noGameMinutes];
    const airtime = splitByWeights(daySlice.airtimeMinutes, weights);
    const watched = splitByWeights(Number(daySlice.minutesWatched), weights);
    return games
      .map((game, index) => ({
        gameName: game.name,
        airtimeMinutes: airtime[index] ?? 0,
        minutesWatched: BigInt(watched[index] ?? 0),
      }))
      .filter((s) => s.airtimeMinutes > 0 || s.minutesWatched > 0n);
  }

  const categories = categoriesOf(daySlice);
  const airtimeShares = splitEvenly(daySlice.airtimeMinutes, categories.length);
  const watchShares = splitEvenly(
    Number(daySlice.minutesWatched),
    categories.length,
  );
  return categories.map((gameName, index) => ({
    gameName,
    airtimeMinutes: airtimeShares[index] ?? 0,
    minutesWatched: BigInt(watchShares[index] ?? 0),
  }));
}

export function buildRollups(
  facts: RollupFact[],
  context: RollupContext,
): BuiltRollups {
  const { source, platform, date, matchedOnly } = context;

  const byChannel = new Map<string, RollupFact[]>();
  const byGame = new Map<string, RollupFact[]>();
  const byChannelGame = new Map<string, RollupFact[]>();

  const push = (
    map: Map<string, RollupFact[]>,
    key: string,
    fact: RollupFact,
  ) => {
    const existing = map.get(key);
    if (existing) existing.push(fact);
    else map.set(key, [fact]);
  };

  const dayKey = utcDayKey(date);
  for (const rawFact of facts) {
    // This day's slice of the stream (C26): facts are loaded by overlap with
    // the day, and each contributes only the part that falls inside it.
    const overlap = dayOverlap(rawFact, date);
    if (overlap.minutes <= 0) continue;

    const fact: RollupFact = {
      ...rawFact,
      airtimeMinutes: Math.round(rawFact.airtimeMinutes * overlap.fraction),
      minutesWatched: BigInt(
        Math.round(Number(rawFact.minutesWatched) * overlap.fraction),
      ),
      sessionViews:
        rawFact.sessionViews === null
          ? null
          : BigInt(Math.round(Number(rawFact.sessionViews) * overlap.fraction)),
    };

    push(byChannel, fact.platformUserId, fact);

    // Per game: Stream Hatchet's per-game minutes for this day when we have
    // them (gameMinutesByDay, see ./game-minutes), else every category the
    // session played (C25) takes an equal share. Either way the shares sum
    // back exactly to the day's airtime/watch time — minus, with real
    // minutes, the time SH lists with no game, which no game is credited.
    const split = splitFactByGame(fact, rawFact, dayKey);
    for (const { gameName, airtimeMinutes, minutesWatched } of split) {
      const categoryFact: RollupFact = {
        ...fact,
        primaryGameName: gameName,
        airtimeMinutes,
        minutesWatched,
      };
      if (!matchedOnly) push(byGame, gameName, categoryFact);
      push(
        byChannelGame,
        `${fact.platformUserId}\u0000${gameName}`,
        categoryFact,
      );
    }
  }

  const channel: ChannelRollupRow[] = [];
  for (const channelFacts of byChannel.values()) {
    const latest = channelFacts[channelFacts.length - 1]!;
    const peak = peakFact(channelFacts);
    const minutesWatched = sumMinutesWatched(channelFacts);
    const airtimeMinutes = sumAirtime(channelFacts);
    const sessionViews = channelFacts.reduce(
      (sum, fact) => sum + (fact.sessionViews ?? 0n),
      0n,
    );

    channel.push({
      source,
      platform,
      date,
      creatorProfileId: latest.creatorProfileId,
      platformUserId: latest.platformUserId,
      platformUsername: latest.platformUsername,
      platformDisplayName: latest.platformDisplayName,
      platformLogoUrl: latest.platformLogoUrl,
      country: latest.country,
      sessionCount: channelFacts.length,
      airtimeMinutes,
      minutesWatched,
      sessionViews,
      averageViewers: averageViewers(minutesWatched, airtimeMinutes),
      averageViewersGlobal: weightedAverage(
        channelFacts.map((fact) => ({
          value: fact.averageViewersGlobal,
          weight: fact.airtimeMinutes,
        })),
      ),
      peakViewers: peak?.peakViewers ?? null,
      peakViewersAt: peak?.peakViewersAt ?? null,
      primaryGameName: mostWatchedGame(channelFacts),
      gameNames: [
        ...new Set(
          channelFacts
            .flatMap((fact) => [fact.primaryGameName, ...fact.allGameNames])
            .filter((game): game is string => Boolean(game)),
        ),
      ].slice(0, 20),
      bestRank: channelFacts.reduce<number | null>(
        (best, fact) =>
          fact.bestRank === null
            ? best
            : best === null
              ? fact.bestRank
              : Math.min(best, fact.bestRank),
        null,
      ),
      averageRank: weightedAverage(
        channelFacts.map((fact) => ({
          value: fact.averageRank,
          weight: fact.airtimeMinutes,
        })),
      ),
      worstRank: channelFacts.reduce<number | null>(
        (worst, fact) =>
          fact.worstRank === null
            ? worst
            : worst === null
              ? fact.worstRank
              : Math.max(worst, fact.worstRank),
        null,
      ),
      lastStreamAt: latest.streamEndsAt,
    });
  }

  const game: GameRollupRow[] = [];
  if (!matchedOnly) {
    for (const [gameName, gameFacts] of byGame.entries()) {
      const minutesWatched = sumMinutesWatched(gameFacts);
      const airtimeMinutes = sumAirtime(gameFacts);
      const peak = peakFact(gameFacts);
      const topChannel = gameFacts.reduce<RollupFact | null>(
        (best, fact) =>
          best === null || fact.minutesWatched > best.minutesWatched
            ? fact
            : best,
        null,
      );

      game.push({
        source,
        platform,
        date,
        gameName,
        sessionCount: gameFacts.length,
        channelCount: new Set(gameFacts.map((fact) => fact.platformUserId))
          .size,
        airtimeMinutes,
        minutesWatched,
        averageViewers: averageViewers(minutesWatched, airtimeMinutes),
        peakViewers: peak?.peakViewers ?? null,
        topChannelUserId: topChannel?.platformUserId ?? null,
        topChannelUsername: topChannel?.platformUsername ?? null,
        topChannelDisplayName: topChannel?.platformDisplayName ?? null,
      });
    }
  }

  const channelGame: ChannelGameRollupRow[] = [];
  for (const channelGameFacts of byChannelGame.values()) {
    const latest = channelGameFacts[channelGameFacts.length - 1]!;
    if (!latest.primaryGameName) continue;

    const minutesWatched = sumMinutesWatched(channelGameFacts);
    const airtimeMinutes = sumAirtime(channelGameFacts);
    const peak = peakFact(channelGameFacts);

    channelGame.push({
      source,
      platform,
      date,
      creatorProfileId: latest.creatorProfileId,
      platformUserId: latest.platformUserId,
      platformUsername: latest.platformUsername,
      platformDisplayName: latest.platformDisplayName,
      gameName: latest.primaryGameName,
      sessionCount: channelGameFacts.length,
      airtimeMinutes,
      minutesWatched,
      averageViewers: averageViewers(minutesWatched, airtimeMinutes),
      peakViewers: peak?.peakViewers ?? null,
    });
  }

  return { channel, game, channelGame };
}
