/**
 * Plain shapes for the daily rollup builder. Deliberately not Prisma types:
 * the builder is pure and must be callable from apps/web and from the root
 * workers (which use their own PrismaClient), and testable without a database.
 *
 * `platform` here is the StreamHatchet platform code as stored on the fact
 * rows ("twitch" | "kick" | "yt" | "ytg"), not our internal Platform enum.
 */

/** One StreamSessionFact row, narrowed to what the rollups actually read. */
export type RollupFact = {
  creatorProfileId: string | null;
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string | null;
  platformLogoUrl: string | null;
  country: string | null;
  streamBeginsAt: Date;
  streamEndsAt: Date;
  peakViewersAt: Date | null;
  primaryGameName: string | null;
  allGameNames: string[];
  airtimeMinutes: number;
  minutesWatched: bigint;
  sessionViews: bigint | null;
  /** Concurrent average over the fact's own airtime; C28 adds these across platforms. */
  averageViewers: number;
  averageViewersGlobal: number | null;
  peakViewers: number;
  bestRank: number | null;
  averageRank: number | null;
  worstRank: number | null;
};

export type RollupContext = {
  source: string;
  platform: string;
  date: Date;
  /** Matched-only imports cover a slice of the platform, so platform-wide game totals are skipped. */
  matchedOnly: boolean;
};

export type ChannelRollupRow = {
  source: string;
  platform: string;
  date: Date;
  creatorProfileId: string | null;
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string | null;
  platformLogoUrl: string | null;
  country: string | null;
  sessionCount: number;
  airtimeMinutes: number;
  minutesWatched: bigint;
  sessionViews: bigint;
  averageViewers: number | null;
  averageViewersGlobal: number | null;
  peakViewers: number | null;
  peakViewersAt: Date | null;
  primaryGameName: string | null;
  gameNames: string[];
  bestRank: number | null;
  averageRank: number | null;
  worstRank: number | null;
  lastStreamAt: Date;
};

export type GameRollupRow = {
  source: string;
  platform: string;
  date: Date;
  gameName: string;
  sessionCount: number;
  channelCount: number;
  airtimeMinutes: number;
  minutesWatched: bigint;
  averageViewers: number | null;
  peakViewers: number | null;
  topChannelUserId: string | null;
  topChannelUsername: string | null;
  topChannelDisplayName: string | null;
};

export type ChannelGameRollupRow = {
  source: string;
  platform: string;
  date: Date;
  creatorProfileId: string | null;
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string | null;
  gameName: string;
  sessionCount: number;
  airtimeMinutes: number;
  minutesWatched: bigint;
  averageViewers: number | null;
  peakViewers: number | null;
};

export type BuiltRollups = {
  channel: ChannelRollupRow[];
  game: GameRollupRow[];
  channelGame: ChannelGameRollupRow[];
};
