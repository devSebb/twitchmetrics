import type { Platform, PrismaClient } from "@twitchmetrics/database";
import { Prisma } from "@twitchmetrics/database";

export const POPULAR_GAMES_WINDOW_DAYS = 30;

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
};

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

/** Canonical identity used by every popular-game data source. */
export function normalizePopularGameName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
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

  return [...aggregated.values()]
    .map(
      (game): RankedPopularGame => ({
        gameName: game.gameName,
        twitchGameIds: [...game.twitchGameIdSet].sort(),
        minutesWatched: game.minutesWatched,
        airtimeMinutes: game.airtimeMinutes,
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
    .sort((left, right) => {
      if (left.minutesWatched !== right.minutesWatched) {
        return left.minutesWatched > right.minutesWatched ? -1 : 1;
      }
      if (left.airtimeMinutes !== right.airtimeMinutes) {
        return right.airtimeMinutes - left.airtimeMinutes;
      }
      if (left.sessionCount !== right.sessionCount) {
        return right.sessionCount - left.sessionCount;
      }
      return normalizePopularGameName(left.gameName).localeCompare(
        normalizePopularGameName(right.gameName),
      );
    })
    .slice(0, limit);
}

export function popularGamesWindowStart(now: Date): Date {
  return new Date(
    now.getTime() - POPULAR_GAMES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
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
  for (const account of accounts) {
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

  const [rollups, sessions, snapshots] = await Promise.all([
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
        gameName: true,
        sessionCount: true,
        airtimeMinutes: true,
        minutesWatched: true,
      },
    }),
    prisma.streamSessionFact.findMany({
      where: {
        streamBeginsAt: { gte: since },
        OR: [
          { creatorProfileId: options.creatorProfileId },
          ...sessionIdentities,
        ],
      },
      select: {
        platform: true,
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

  // Prefer the strongest available source per platform. This prevents daily
  // rollups, session facts, and snapshots from counting the same broadcast.
  const rollupPlatforms = new Set<Platform>();
  const contributions: PopularGameContribution[] = rollups.flatMap((rollup) => {
    const platform = internalPlatform(rollup.platform);
    if (platform) rollupPlatforms.add(platform);
    if (!rollup.gameName.trim()) return [];
    return [
      {
        gameName: rollup.gameName,
        platform,
        minutesWatched: rollup.minutesWatched,
        airtimeMinutes: rollup.airtimeMinutes,
        sessionCount: rollup.sessionCount,
        observationCount: 0,
        estimated: false,
      },
    ];
  });

  const sessionPlatforms = new Set<Platform>();
  for (const session of sessions) {
    const platform = internalPlatform(session.platform);
    if (!platform || rollupPlatforms.has(platform)) continue;
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
