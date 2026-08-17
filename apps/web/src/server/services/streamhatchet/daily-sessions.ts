import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import readline from "node:readline";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Prisma, prisma, type Platform } from "@twitchmetrics/database";
import { canonicalProfileId } from "../identity/canonical-profile";

export type StreamHatchetDailySessionPlatform =
  | "kick"
  | "twitch"
  | "yt"
  | "ytg"
  | "facebook";

export type StreamHatchetDailySessionImportResult = {
  platform: StreamHatchetDailySessionPlatform;
  date: string;
  key: string;
  scanned: number;
  parsed: number;
  written: number;
  skipped: number;
  failed: number;
  matched: number;
  skippedExisting: boolean;
  rollups: {
    channelRollups: number;
    gameRollups: number;
    channelGameRollups: number;
  } | null;
};

type ImportConfig = {
  bucket: string;
  prefix: string;
  region?: string;
  platform: StreamHatchetDailySessionPlatform;
  date: Date;
  matchedOnly: boolean;
  force?: boolean;
  // Import facts only and leave the source object "running"; the caller must
  // follow up with finalizeStreamHatchetDailySessionRollups. Lets serverless
  // callers split the work across two invocations that each fit maxDuration.
  skipRollups?: boolean;
};

type StreamHatchetDailySession = {
  source: "streamhatchet";
  platform: StreamHatchetDailySessionPlatform;
  platformUserId: string;
  platformVideoId: string | null;
  platformUsername: string;
  platformDisplayName: string | null;
  platformLogoUrl: string | null;
  country: string | null;
  partitionDate: Date;
  streamBeginsAt: Date;
  streamEndsAt: Date;
  peakViewersAt: Date | null;
  sessionTitle: string | null;
  primaryGameName: string | null;
  allGameNames: string[];
  airtimeMinutes: number;
  minutesWatched: bigint;
  sessionViews: bigint | null;
  averageViewers: number;
  averageViewersGlobal: number | null;
  peakViewers: number;
  share: number | null;
  shareCrossPlatform: number | null;
  bestRank: number | null;
  averageRank: number | null;
  worstRank: number | null;
  aggregation: string;
  rawData: unknown | null;
  contentLabel: unknown | null;
  rowHash: string;
};

const ROLLUP_SESSION_SELECT = {
  creatorProfileId: true,
  platformUserId: true,
  platformUsername: true,
  platformDisplayName: true,
  platformLogoUrl: true,
  country: true,
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

type RollupSession = Prisma.StreamSessionFactGetPayload<{
  select: typeof ROLLUP_SESSION_SELECT;
}>;

const SOURCE = "streamhatchet";
const DEFAULT_BUCKET = "streamhatchet-aggregations";
const DEFAULT_PREFIX = "daily_sessions/summary";
const BATCH_SIZE = 1000;

let s3Client: S3Client | null = null;

function getS3Client(region?: string): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: region ?? process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return s3Client;
}

export function buildDailySessionKey(
  prefix: string,
  date: Date,
  platform: StreamHatchetDailySessionPlatform,
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  return `${cleanPrefix}/year=${year}/month=${month}/day=${day}/${platform}/basic.csv`;
}

export function formatPartitionDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toInternalPlatform(
  platform: StreamHatchetDailySessionPlatform,
): Platform | null {
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

function importMode(matchedOnly: boolean): "matched" | "full" {
  return matchedOnly ? "matched" : "full";
}

function metadataImportMode(
  metadata: Prisma.JsonValue | null,
): "matched" | "full" | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "full";
  }
  const value = (metadata as { importMode?: unknown }).importMode;
  return value === "matched" || value === "full" ? value : "full";
}

function canSkipImportedObject(input: {
  existingMode: "matched" | "full" | null;
  currentMode: "matched" | "full";
}): boolean {
  if (input.existingMode === input.currentMode) return true;
  return input.existingMode === "full" && input.currentMode === "matched";
}

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
  if (value == null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Resolve creatorProfileIds for one flush batch via indexed lookups. Replaces
 * the old whole-platform preload: since the SH catalogs landed, loading every
 * account for a platform (578k twitch rows) no longer fits the serverless
 * time/memory budget.
 */
async function resolveBatchProfileMatches(
  platform: StreamHatchetDailySessionPlatform,
  sessions: StreamHatchetDailySession[],
): Promise<Map<string, string>> {
  const internalPlatform = toInternalPlatform(platform);
  const resolved = new Map<string, string>();
  if (!internalPlatform || sessions.length === 0) return resolved;

  const userIds = [...new Set(sessions.map((s) => s.platformUserId))];
  // Kick facts can carry a different id than our catalog row; kick (only)
  // falls back to case-insensitive username matching.
  const usernames =
    platform === "kick"
      ? [...new Set(sessions.map((s) => s.platformUsername.toLowerCase()))]
      : [];

  const accounts = await prisma.platformAccount.findMany({
    where: {
      platform: internalPlatform,
      OR: [
        { platformUserId: { in: userIds } },
        ...(usernames.length > 0
          ? [
              {
                platformUsername: {
                  in: usernames,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    select: {
      platformUserId: true,
      platformUsername: true,
      creatorProfileId: true,
      // An account can sit on a merged redirect stub (same-platform collision
      // at merge time). Its facts belong to the canonical creator, never the
      // stub — otherwise the channel's history is unreachable.
      creatorProfile: { select: { id: true, mergedIntoId: true } },
    },
  });

  const byUserId = new Map<string, string>();
  const byUsername = new Map<string, string>();
  for (const account of accounts) {
    const ownerId = canonicalProfileId(account.creatorProfile);
    byUserId.set(account.platformUserId, ownerId);
    byUsername.set(account.platformUsername.toLowerCase(), ownerId);
  }

  for (const session of sessions) {
    const match =
      byUserId.get(session.platformUserId) ??
      (platform === "kick"
        ? byUsername.get(session.platformUsername.toLowerCase())
        : undefined);
    if (match) resolved.set(session.rowHash, match);
  }

  return resolved;
}

function sessionCreateInput(
  session: StreamHatchetDailySession,
  sourceObjectId: string,
  creatorProfileId: string | null,
): Prisma.StreamSessionFactCreateManyInput {
  return {
    source: session.source,
    sourceObjectId,
    creatorProfileId,
    platform: session.platform,
    platformUserId: session.platformUserId,
    platformVideoId: session.platformVideoId,
    platformUsername: session.platformUsername,
    platformDisplayName: session.platformDisplayName,
    platformLogoUrl: session.platformLogoUrl,
    country: session.country,
    partitionDate: session.partitionDate,
    streamBeginsAt: session.streamBeginsAt,
    streamEndsAt: session.streamEndsAt,
    peakViewersAt: session.peakViewersAt,
    sessionTitle: session.sessionTitle,
    primaryGameName: session.primaryGameName,
    allGameNames: session.allGameNames,
    airtimeMinutes: session.airtimeMinutes,
    minutesWatched: session.minutesWatched,
    sessionViews: session.sessionViews,
    averageViewers: session.averageViewers,
    averageViewersGlobal: session.averageViewersGlobal,
    peakViewers: session.peakViewers,
    share: session.share,
    shareCrossPlatform: session.shareCrossPlatform,
    bestRank: session.bestRank,
    averageRank: session.averageRank,
    worstRank: session.worstRank,
    aggregation: session.aggregation,
    rawData: jsonValue(session.rawData),
    contentLabel: jsonValue(session.contentLabel),
    rowHash: session.rowHash,
  };
}

function weightedAverage(
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

function mostWatchedGame(sessions: RollupSession[]): string | null {
  const totals = new Map<string, bigint>();
  for (const session of sessions) {
    if (!session.primaryGameName) continue;
    totals.set(
      session.primaryGameName,
      (totals.get(session.primaryGameName) ?? 0n) + session.minutesWatched,
    );
  }
  return (
    [...totals.entries()].sort((a, b) =>
      a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] > b[1] ? -1 : 1,
    )[0]?.[0] ?? null
  );
}

async function recomputeRollups(input: {
  platform: StreamHatchetDailySessionPlatform;
  partitionDate: Date;
  matchedOnly: boolean;
}): Promise<{
  channelRollups: number;
  gameRollups: number;
  channelGameRollups: number;
}> {
  // Select only rollup inputs — the full row drags rawData/contentLabel JSON
  // for every session (~82k rows for twitch), which alone blew the step budget.
  const sessions = await prisma.streamSessionFact.findMany({
    where: {
      source: SOURCE,
      platform: input.platform,
      partitionDate: input.partitionDate,
    },
    orderBy: { streamEndsAt: "asc" },
    select: ROLLUP_SESSION_SELECT,
  });

  await prisma.$transaction([
    prisma.channelDailyRollup.deleteMany({
      where: {
        source: SOURCE,
        platform: input.platform,
        date: input.partitionDate,
      },
    }),
    ...(input.matchedOnly
      ? []
      : [
          prisma.gameDailyRollup.deleteMany({
            where: {
              source: SOURCE,
              platform: input.platform,
              date: input.partitionDate,
            },
          }),
        ]),
    prisma.channelGameDailyRollup.deleteMany({
      where: {
        source: SOURCE,
        platform: input.platform,
        date: input.partitionDate,
      },
    }),
  ]);

  const byChannel = new Map<string, RollupSession[]>();
  const byGame = new Map<string, RollupSession[]>();
  const byChannelGame = new Map<string, RollupSession[]>();

  for (const session of sessions) {
    const channelKey = session.platformUserId;
    byChannel.set(channelKey, [...(byChannel.get(channelKey) ?? []), session]);

    const gameName = session.primaryGameName;
    if (!gameName) continue;

    if (!input.matchedOnly) {
      byGame.set(gameName, [...(byGame.get(gameName) ?? []), session]);
    }
    const channelGameKey = `${channelKey}\u0000${gameName}`;
    byChannelGame.set(channelGameKey, [
      ...(byChannelGame.get(channelGameKey) ?? []),
      session,
    ]);
  }

  const channelRollups: Prisma.ChannelDailyRollupCreateManyInput[] = [];
  for (const channelSessions of byChannel.values()) {
    const latest = channelSessions[channelSessions.length - 1]!;
    const peak = channelSessions.reduce(
      (best, session) =>
        best === null || session.peakViewers > best.peakViewers
          ? session
          : best,
      null as RollupSession | null,
    );
    const minutesWatched = channelSessions.reduce(
      (sum, session) => sum + session.minutesWatched,
      0n,
    );
    const airtimeMinutes = channelSessions.reduce(
      (sum, session) => sum + session.airtimeMinutes,
      0,
    );
    const sessionViews = channelSessions.reduce(
      (sum, session) => sum + (session.sessionViews ?? 0n),
      0n,
    );

    channelRollups.push({
      source: SOURCE,
      platform: input.platform,
      date: input.partitionDate,
      creatorProfileId: latest.creatorProfileId,
      platformUserId: latest.platformUserId,
      platformUsername: latest.platformUsername,
      platformDisplayName: latest.platformDisplayName,
      platformLogoUrl: latest.platformLogoUrl,
      country: latest.country,
      sessionCount: channelSessions.length,
      airtimeMinutes,
      minutesWatched,
      sessionViews,
      averageViewers:
        airtimeMinutes > 0 ? Number(minutesWatched) / airtimeMinutes : null,
      averageViewersGlobal: weightedAverage(
        channelSessions.map((session) => ({
          value: session.averageViewersGlobal,
          weight: session.airtimeMinutes,
        })),
      ),
      peakViewers: peak?.peakViewers ?? null,
      peakViewersAt: peak?.peakViewersAt ?? null,
      primaryGameName: mostWatchedGame(channelSessions),
      gameNames: [
        ...new Set(
          channelSessions
            .flatMap((session) => [
              session.primaryGameName,
              ...session.allGameNames,
            ])
            .filter((game): game is string => Boolean(game)),
        ),
      ].slice(0, 20),
      bestRank: channelSessions.reduce<number | null>(
        (best, session) =>
          session.bestRank === null
            ? best
            : best === null
              ? session.bestRank
              : Math.min(best, session.bestRank),
        null,
      ),
      averageRank: weightedAverage(
        channelSessions.map((session) => ({
          value: session.averageRank,
          weight: session.airtimeMinutes,
        })),
      ),
      worstRank: channelSessions.reduce<number | null>(
        (worst, session) =>
          session.worstRank === null
            ? worst
            : worst === null
              ? session.worstRank
              : Math.max(worst, session.worstRank),
        null,
      ),
      lastStreamAt: latest.streamEndsAt,
    });
  }

  const gameRollups: Prisma.GameDailyRollupCreateManyInput[] = [];
  if (!input.matchedOnly) {
    for (const [gameName, gameSessions] of byGame.entries()) {
      const minutesWatched = gameSessions.reduce(
        (sum, session) => sum + session.minutesWatched,
        0n,
      );
      const airtimeMinutes = gameSessions.reduce(
        (sum, session) => sum + session.airtimeMinutes,
        0,
      );
      const peak = gameSessions.reduce(
        (best, session) =>
          best === null || session.peakViewers > best.peakViewers
            ? session
            : best,
        null as RollupSession | null,
      );
      const topChannel = gameSessions.reduce(
        (best, session) =>
          best === null || session.minutesWatched > best.minutesWatched
            ? session
            : best,
        null as RollupSession | null,
      );

      gameRollups.push({
        source: SOURCE,
        platform: input.platform,
        date: input.partitionDate,
        gameName,
        sessionCount: gameSessions.length,
        channelCount: new Set(gameSessions.map((s) => s.platformUserId)).size,
        airtimeMinutes,
        minutesWatched,
        averageViewers:
          airtimeMinutes > 0 ? Number(minutesWatched) / airtimeMinutes : null,
        peakViewers: peak?.peakViewers ?? null,
        topChannelUserId: topChannel?.platformUserId ?? null,
        topChannelUsername: topChannel?.platformUsername ?? null,
        topChannelDisplayName: topChannel?.platformDisplayName ?? null,
      });
    }
  }

  const channelGameRollups: Prisma.ChannelGameDailyRollupCreateManyInput[] = [];
  for (const channelGameSessions of byChannelGame.values()) {
    const latest = channelGameSessions[channelGameSessions.length - 1]!;
    if (!latest.primaryGameName) continue;

    const minutesWatched = channelGameSessions.reduce(
      (sum, session) => sum + session.minutesWatched,
      0n,
    );
    const airtimeMinutes = channelGameSessions.reduce(
      (sum, session) => sum + session.airtimeMinutes,
      0,
    );
    const peak = channelGameSessions.reduce(
      (best, session) =>
        best === null || session.peakViewers > best.peakViewers
          ? session
          : best,
      null as RollupSession | null,
    );

    channelGameRollups.push({
      source: SOURCE,
      platform: input.platform,
      date: input.partitionDate,
      creatorProfileId: latest.creatorProfileId,
      platformUserId: latest.platformUserId,
      platformUsername: latest.platformUsername,
      platformDisplayName: latest.platformDisplayName,
      gameName: latest.primaryGameName,
      sessionCount: channelGameSessions.length,
      airtimeMinutes,
      minutesWatched,
      averageViewers:
        airtimeMinutes > 0 ? Number(minutesWatched) / airtimeMinutes : null,
      peakViewers: peak?.peakViewers ?? null,
    });
  }

  for (const batch of chunk(channelRollups, BATCH_SIZE)) {
    await prisma.channelDailyRollup.createMany({ data: batch });
  }
  for (const batch of chunk(gameRollups, BATCH_SIZE)) {
    await prisma.gameDailyRollup.createMany({ data: batch });
  }
  for (const batch of chunk(channelGameRollups, BATCH_SIZE)) {
    await prisma.channelGameDailyRollup.createMany({ data: batch });
  }

  return {
    channelRollups: channelRollups.length,
    gameRollups: gameRollups.length,
    channelGameRollups: channelGameRollups.length,
  };
}

function isCsvRecordComplete(record: string): boolean {
  let inQuotes = false;
  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (ch !== '"') continue;
    if (inQuotes && record[i + 1] === '"') {
      i++;
      continue;
    }
    inQuotes = !inQuotes;
  }
  return !inQuotes;
}

function parseCsvRecord(record: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < record.length; i++) {
    const ch = record[i];

    if (inQuotes) {
      if (ch === '"' && record[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === ",") {
      out.push(field);
      field = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      field += ch;
    }
  }

  out.push(field);
  return out;
}

function parseNullableString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseNumberValue(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntValue(value: string | undefined): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBigIntValue(value: string | undefined): bigint | null {
  if (!value || value.trim() === "") return null;
  try {
    return BigInt(Math.round(Number(value)));
  } catch {
    return null;
  }
}

function parseEpochSeconds(value: string | undefined): Date | null {
  const seconds = parseIntValue(value);
  return seconds !== null ? new Date(seconds * 1000) : null;
}

function parseJsonValue(value: string | undefined): unknown | null {
  if (!value || value.trim() === "") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractGames(rawData: unknown): string[] {
  if (!rawData || typeof rawData !== "object") return [];
  const games = (rawData as { games?: unknown }).games;
  if (!Array.isArray(games)) return [];
  return games
    .filter((game): game is string => typeof game === "string")
    .map((game) => game.trim())
    .filter(Boolean);
}

function hashSession(input: {
  platform: StreamHatchetDailySessionPlatform;
  platformUserId: string;
  platformVideoId: string | null;
  streamBeginsAt: Date;
  streamEndsAt: Date;
  minutesWatched: bigint;
  airtimeMinutes: number;
  peakViewers: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        platform: input.platform,
        platformUserId: input.platformUserId,
        platformVideoId: input.platformVideoId,
        streamBeginsAt: input.streamBeginsAt.toISOString(),
        streamEndsAt: input.streamEndsAt.toISOString(),
        minutesWatched: input.minutesWatched.toString(),
        airtimeMinutes: input.airtimeMinutes,
        peakViewers: input.peakViewers,
      }),
    )
    .digest("hex");
}

function normalizeRow(
  row: Record<string, string>,
  platform: StreamHatchetDailySessionPlatform,
  partitionDate: Date,
): StreamHatchetDailySession | null {
  const platformUserId = parseNullableString(row.user_id);
  const username = parseNullableString(row.username);
  const streamBeginsAt = parseEpochSeconds(row.stream_begins);
  const streamEndsAt = parseEpochSeconds(row.stream_ends);
  const minutesWatched = parseBigIntValue(row.minutes_watched);
  const airtimeMinutes = parseIntValue(row.airtime_minutes);
  const averageViewers = parseNumberValue(row.average_viewers);
  const peakViewers = parseIntValue(row.peak_viewers);

  if (
    !platformUserId ||
    !username ||
    !streamBeginsAt ||
    !streamEndsAt ||
    minutesWatched === null ||
    airtimeMinutes === null ||
    averageViewers === null ||
    peakViewers === null
  ) {
    return null;
  }

  const rawData = parseJsonValue(row.data);
  const games = extractGames(rawData);
  const primaryGameName =
    parseNullableString(row.primary_game) ?? games[0] ?? null;
  const platformVideoId = parseNullableString(row.video_id);

  const session = {
    source: "streamhatchet" as const,
    platform,
    platformUserId,
    platformVideoId,
    platformUsername: username,
    platformDisplayName: parseNullableString(row.display_name),
    platformLogoUrl: parseNullableString(row.logo),
    country: parseNullableString(row.country),
    partitionDate,
    streamBeginsAt,
    streamEndsAt,
    peakViewersAt: parseEpochSeconds(row.timestamp_peak_viewers),
    sessionTitle: parseNullableString(row.session_title),
    primaryGameName,
    allGameNames: games,
    airtimeMinutes,
    minutesWatched,
    sessionViews: parseBigIntValue(row.session_views),
    averageViewers,
    averageViewersGlobal: parseNumberValue(row.average_viewers_global),
    peakViewers,
    share: parseNumberValue(row.share),
    shareCrossPlatform: parseNumberValue(row.share_cross_platform),
    bestRank: parseIntValue(row.max_rank),
    averageRank: parseNumberValue(row.avg_rank),
    worstRank: parseIntValue(row.min_rank),
    aggregation: parseNullableString(row.aggregation) ?? "basic",
    rawData,
    contentLabel: parseJsonValue(row.content_label),
    rowHash: "",
  };

  return {
    ...session,
    rowHash: hashSession(session),
  };
}

function toNodeReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;

  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return Readable.fromWeb(body.transformToWebStream());
  }

  throw new Error("Unsupported S3 body stream type");
}

async function parseDailySessionCsv(input: {
  stream: Readable;
  platform: StreamHatchetDailySessionPlatform;
  partitionDate: Date;
  onSession: (session: StreamHatchetDailySession) => Promise<void> | void;
}): Promise<{
  rowsScanned: number;
  rowsAccepted: number;
  rowsRejected: number;
}> {
  const rl = readline.createInterface({
    input: input.stream.setEncoding("utf8"),
    crlfDelay: Infinity,
  });

  let header: string[] | null = null;
  let pending = "";
  let rowsScanned = 0;
  let rowsAccepted = 0;
  let rowsRejected = 0;

  for await (const line of rl) {
    pending = pending ? `${pending}\n${line}` : line;
    if (!isCsvRecordComplete(pending)) continue;

    const cells = parseCsvRecord(pending);
    pending = "";

    if (!header) {
      header = cells.map((column) => column.replace(/^\uFEFF/, ""));
      continue;
    }

    rowsScanned++;
    const row = Object.fromEntries(
      header.map((column, index) => [column, cells[index] ?? ""]),
    );
    const session = normalizeRow(row, input.platform, input.partitionDate);

    if (!session) {
      rowsRejected++;
      continue;
    }

    await input.onSession(session);
    rowsAccepted++;
  }

  return { rowsScanned, rowsAccepted, rowsRejected };
}

export async function ingestStreamHatchetDailySessionObject(
  input: Partial<Pick<ImportConfig, "bucket" | "prefix" | "region">> &
    Pick<
      ImportConfig,
      "platform" | "date" | "matchedOnly" | "force" | "skipRollups"
    >,
): Promise<StreamHatchetDailySessionImportResult> {
  const bucket =
    input.bucket ?? process.env.STREAMHATCHET_S3_BUCKET ?? DEFAULT_BUCKET;
  const prefix =
    input.prefix ?? process.env.STREAMHATCHET_S3_PREFIX ?? DEFAULT_PREFIX;
  const region = input.region ?? process.env.AWS_REGION;
  const partitionDate = new Date(input.date);
  partitionDate.setUTCHours(0, 0, 0, 0);

  const key = buildDailySessionKey(prefix, partitionDate, input.platform);
  const mode = importMode(input.matchedOnly);
  const s3 = getS3Client(region);

  const head = await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  const currentEtag = head.ETag?.replace(/^"|"$/g, "") ?? null;

  const existingObject = await prisma.streamHatchetSourceObject.findUnique({
    where: { bucket_key: { bucket, key } },
  });

  // The S3 file was restated (new content) since we last imported it. Its rows
  // must be replaced, not deduped against the stale ones.
  const etagChanged =
    existingObject != null && existingObject.etag !== currentEtag;

  if (
    existingObject &&
    existingObject.status === "completed" &&
    existingObject.etag === currentEtag &&
    canSkipImportedObject({
      existingMode: metadataImportMode(existingObject.metadata),
      currentMode: mode,
    }) &&
    !input.force
  ) {
    return {
      platform: input.platform,
      date: formatPartitionDate(partitionDate),
      key,
      scanned: 0,
      parsed: 0,
      written: 0,
      skipped: existingObject.importedRows,
      failed: 0,
      matched: 0,
      skippedExisting: true,
      rollups: null,
    };
  }

  const sourceObject = await prisma.streamHatchetSourceObject.upsert({
    where: { bucket_key: { bucket, key } },
    update: {
      etag: currentEtag,
      size: head.ContentLength == null ? null : BigInt(head.ContentLength),
      lastModified: head.LastModified ?? null,
      platform: input.platform,
      partitionDate,
      status: "running",
      errorSummary: null,
      metadata: {
        importMode: mode,
        matchedOnly: input.matchedOnly,
        trigger: "inngest",
      } satisfies Prisma.InputJsonValue,
    },
    create: {
      bucket,
      key,
      etag: currentEtag,
      size: head.ContentLength == null ? null : BigInt(head.ContentLength),
      lastModified: head.LastModified ?? null,
      platform: input.platform,
      partitionDate,
      status: "running",
      metadata: {
        importMode: mode,
        matchedOnly: input.matchedOnly,
        trigger: "inngest",
      } satisfies Prisma.InputJsonValue,
    },
  });

  try {
    if (input.force || etagChanged) {
      await prisma.streamSessionFact.deleteMany({
        where: { sourceObjectId: sourceObject.id },
      });
    }

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!object.Body) {
      throw new Error(`S3 object has no body: s3://${bucket}/${key}`);
    }

    let matchedSessions = 0;
    let written = 0;
    let pendingSessions: StreamHatchetDailySession[] = [];

    async function flushPendingSessions() {
      if (pendingSessions.length === 0) return;
      const batch = pendingSessions;
      pendingSessions = [];

      const matches = await resolveBatchProfileMatches(input.platform, batch);
      for (const session of batch) {
        if (matches.has(session.rowHash)) matchedSessions++;
      }

      const rows = batch
        .filter((session) => !input.matchedOnly || matches.has(session.rowHash))
        .map((session) =>
          sessionCreateInput(
            session,
            sourceObject.id,
            matches.get(session.rowHash) ?? null,
          ),
        );
      if (rows.length === 0) return;

      const result = await prisma.streamSessionFact.createMany({
        data: rows,
        skipDuplicates: true,
      });
      written += result.count;
    }

    const parseStats = await parseDailySessionCsv({
      stream: toNodeReadable(object.Body),
      platform: input.platform,
      partitionDate,
      onSession: async (session) => {
        pendingSessions.push(session);
        if (pendingSessions.length >= BATCH_SIZE) {
          await flushPendingSessions();
        }
      },
    });
    await flushPendingSessions();

    const rollups = input.skipRollups
      ? null
      : await recomputeRollups({
          platform: input.platform,
          partitionDate,
          matchedOnly: input.matchedOnly,
        });

    await prisma.streamHatchetSourceObject.update({
      where: { id: sourceObject.id },
      data: {
        // Facts-only imports stay "running"; the follow-up rollup step
        // (finalizeStreamHatchetDailySessionRollups) marks them completed.
        status: input.skipRollups ? "running" : "completed",
        rowCount: parseStats.rowsScanned,
        importedRows: written,
        skippedRows: parseStats.rowsAccepted - written,
        failedRows: parseStats.rowsRejected,
        lastImportedAt: new Date(),
        metadata: {
          parsedRows: parseStats.rowsAccepted,
          matchedExistingProfiles: matchedSessions,
          matchedOnly: input.matchedOnly,
          importMode: mode,
          sourceObjectId: sourceObject.id,
          trigger: "inngest",
          ...(rollups ? { rollups } : {}),
        } satisfies Prisma.InputJsonValue,
      },
    });

    return {
      platform: input.platform,
      date: formatPartitionDate(partitionDate),
      key,
      scanned: parseStats.rowsScanned,
      parsed: parseStats.rowsAccepted,
      written,
      skipped: parseStats.rowsAccepted - written,
      failed: parseStats.rowsRejected,
      matched: matchedSessions,
      skippedExisting: false,
      rollups,
    };
  } catch (error) {
    await prisma.streamHatchetSourceObject.update({
      where: { id: sourceObject.id },
      data: {
        status: "failed",
        errorSummary:
          error instanceof Error ? error.message.slice(0, 1000) : String(error),
      },
    });
    throw error;
  }
}

/**
 * Recompute the three daily rollup tables for an already-imported partition
 * and mark its source object completed. Split out of the facts import so each
 * half fits the serverless step budget — the combined twitch run exceeded
 * maxDuration daily, leaving objects stuck "running" and blocking later
 * platforms in the cron loop.
 */
export async function finalizeStreamHatchetDailySessionRollups(
  input: Partial<Pick<ImportConfig, "bucket" | "prefix">> &
    Pick<ImportConfig, "platform" | "date" | "matchedOnly">,
): Promise<{
  channelRollups: number;
  gameRollups: number;
  channelGameRollups: number;
} | null> {
  const bucket =
    input.bucket ?? process.env.STREAMHATCHET_S3_BUCKET ?? DEFAULT_BUCKET;
  const prefix =
    input.prefix ?? process.env.STREAMHATCHET_S3_PREFIX ?? DEFAULT_PREFIX;
  const partitionDate = new Date(input.date);
  partitionDate.setUTCHours(0, 0, 0, 0);
  const key = buildDailySessionKey(prefix, partitionDate, input.platform);

  const sourceObject = await prisma.streamHatchetSourceObject.findUnique({
    where: { bucket_key: { bucket, key } },
  });
  if (!sourceObject) return null;

  const rollups = await recomputeRollups({
    platform: input.platform,
    partitionDate,
    matchedOnly: input.matchedOnly,
  });

  const existingMetadata =
    sourceObject.metadata &&
    typeof sourceObject.metadata === "object" &&
    !Array.isArray(sourceObject.metadata)
      ? sourceObject.metadata
      : {};

  await prisma.streamHatchetSourceObject.update({
    where: { id: sourceObject.id },
    data: {
      status: "completed",
      metadata: { ...existingMetadata, rollups } as Prisma.InputJsonValue,
    },
  });

  return rollups;
}
