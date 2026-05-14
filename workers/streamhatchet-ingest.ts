/**
 * StreamHatchet Daily Session Ingestion
 *
 * Reads StreamHatchet S3 daily session summary files and imports normalized
 * stream-session facts plus daily rollups. Defaults to dry-run; pass --write
 * to persist. The first intended production target is KICK.
 *
 * Usage:
 *   pnpm worker:streamhatchet -- --platform kick --date 2026-05-13
 *   pnpm worker:streamhatchet -- --platform kick --date 2026-05-13 --write
 *   pnpm worker:streamhatchet -- --platform kick --days 30 --write
 */

import { PrismaClient, Prisma, type Platform } from "@prisma/client";
import {
  buildDailySessionKey,
  countS3CsvRows,
  downloadS3Object,
  headS3Object,
  parseDailySessionCsv,
  type DailySessionPlatform,
  type StreamHatchetDailySession,
} from "./lib/streamhatchet-daily-sessions";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

const VALID_PLATFORMS = new Set<DailySessionPlatform>([
  "kick",
  "twitch",
  "yt",
  "ytg",
  "facebook",
]);

const DEFAULT_BUCKET = "streamhatchet-aggregations";
const DEFAULT_PREFIX = "daily_sessions/summary";
const DEFAULT_PROFILE = "streamhatchet-readonly";
const SOURCE = "streamhatchet";
const BATCH_SIZE = 1000;

type ImportConfig = {
  bucket: string;
  prefix: string;
  profile: string;
  region: string | undefined;
  platform: DailySessionPlatform;
  dates: Date[];
  write: boolean;
  force: boolean;
  rowLimit: number | undefined;
};

type ExistingProfileMatch = {
  creatorProfileId: string;
  accountId: string;
};

function argValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date '${value}'. Use YYYY-MM-DD.`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    dates.push(cursor);
  }
  return dates;
}

function parseConfig(): ImportConfig {
  const platformArg = argValue("--platform") ?? "kick";
  if (!VALID_PLATFORMS.has(platformArg as DailySessionPlatform)) {
    throw new Error(`Unsupported platform '${platformArg}'.`);
  }

  const rowLimitArg = argValue("--row-limit");
  const rowLimit = rowLimitArg ? Number.parseInt(rowLimitArg, 10) : undefined;

  let dates: Date[];
  const singleDate = argValue("--date");
  const startDate = argValue("--start-date");
  const endDate = argValue("--end-date");
  const daysArg = argValue("--days");

  if (singleDate) {
    dates = [parseDate(singleDate)];
  } else if (startDate && endDate) {
    dates = dateRange(parseDate(startDate), parseDate(endDate));
  } else if (daysArg) {
    const days = Number.parseInt(daysArg, 10);
    if (!Number.isFinite(days) || days < 1) {
      throw new Error("--days must be a positive integer.");
    }
    const yesterdayUtc = new Date();
    yesterdayUtc.setUTCHours(0, 0, 0, 0);
    yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
    const start = new Date(yesterdayUtc.getTime() - (days - 1) * 86_400_000);
    dates = dateRange(start, yesterdayUtc);
  } else {
    const yesterdayUtc = new Date();
    yesterdayUtc.setUTCHours(0, 0, 0, 0);
    yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
    dates = [yesterdayUtc];
  }

  return {
    bucket:
      argValue("--bucket") ??
      process.env.STREAMHATCHET_S3_BUCKET ??
      DEFAULT_BUCKET,
    prefix:
      argValue("--prefix") ??
      process.env.STREAMHATCHET_S3_PREFIX ??
      DEFAULT_PREFIX,
    profile:
      argValue("--profile") ??
      process.env.STREAMHATCHET_AWS_PROFILE ??
      DEFAULT_PROFILE,
    region: argValue("--region") ?? process.env.AWS_REGION,
    platform: platformArg as DailySessionPlatform,
    dates,
    write: args.includes("--write"),
    force: args.includes("--force"),
    rowLimit:
      rowLimit && Number.isFinite(rowLimit) && rowLimit > 0
        ? rowLimit
        : undefined,
  };
}

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  const ts = new Date().toISOString();
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console[level](`[${ts}] [streamhatchet-ingest] ${message}${extra}`);
}

function toInternalPlatform(platform: DailySessionPlatform): Platform | null {
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

async function loadExistingProfileMatches(
  platform: DailySessionPlatform,
): Promise<{
  byPlatformUserId: Map<string, ExistingProfileMatch>;
  byUsername: Map<string, ExistingProfileMatch>;
}> {
  const internalPlatform = toInternalPlatform(platform);
  if (!internalPlatform) {
    return { byPlatformUserId: new Map(), byUsername: new Map() };
  }

  const accounts = await prisma.platformAccount.findMany({
    where: { platform: internalPlatform },
    select: {
      id: true,
      platformUserId: true,
      platformUsername: true,
      creatorProfileId: true,
    },
  });

  const byPlatformUserId = new Map<string, ExistingProfileMatch>();
  const byUsername = new Map<string, ExistingProfileMatch>();

  for (const account of accounts) {
    const match = {
      accountId: account.id,
      creatorProfileId: account.creatorProfileId,
    };
    byPlatformUserId.set(account.platformUserId, match);
    byUsername.set(account.platformUsername.toLowerCase(), match);
  }

  return { byPlatformUserId, byUsername };
}

function resolveCreatorProfileId(
  session: StreamHatchetDailySession,
  matches: Awaited<ReturnType<typeof loadExistingProfileMatches>>,
): string | null {
  return (
    matches.byPlatformUserId.get(session.platformUserId)?.creatorProfileId ??
    matches.byUsername.get(session.platformUsername.toLowerCase())
      ?.creatorProfileId ??
    null
  );
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

type RollupSession = Awaited<
  ReturnType<typeof prisma.streamSessionFact.findMany>
>[number];

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
  platform: DailySessionPlatform;
  partitionDate: Date;
}): Promise<{
  channelRollups: number;
  gameRollups: number;
  channelGameRollups: number;
}> {
  const sessions = await prisma.streamSessionFact.findMany({
    where: {
      source: SOURCE,
      platform: input.platform,
      partitionDate: input.partitionDate,
    },
    orderBy: { streamEndsAt: "asc" },
  });

  await prisma.$transaction([
    prisma.channelDailyRollup.deleteMany({
      where: {
        source: SOURCE,
        platform: input.platform,
        date: input.partitionDate,
      },
    }),
    prisma.gameDailyRollup.deleteMany({
      where: {
        source: SOURCE,
        platform: input.platform,
        date: input.partitionDate,
      },
    }),
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
    if (gameName) {
      byGame.set(gameName, [...(byGame.get(gameName) ?? []), session]);
      const channelGameKey = `${channelKey}\u0000${gameName}`;
      byChannelGame.set(channelGameKey, [
        ...(byChannelGame.get(channelGameKey) ?? []),
        session,
      ]);
    }
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
    const averageViewers =
      airtimeMinutes > 0 ? Number(minutesWatched) / airtimeMinutes : null;

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
      averageViewers,
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

  const channelGameRollups: Prisma.ChannelGameDailyRollupCreateManyInput[] = [];
  for (const channelGameSessions of byChannelGame.values()) {
    const latest = channelGameSessions[channelGameSessions.length - 1]!;
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

    if (!latest.primaryGameName) continue;
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

async function importOneDate(config: ImportConfig, date: Date) {
  const key = buildDailySessionKey(config.prefix, date, config.platform);
  log("info", "Inspecting S3 object", {
    bucket: config.bucket,
    key,
    write: config.write,
  });

  const metadata = await headS3Object(config.bucket, key, {
    profile: config.profile,
    region: config.region,
  });
  const s3RowCount = await countS3CsvRows(config.bucket, key, {
    profile: config.profile,
    region: config.region,
  });
  const localPath = await downloadS3Object(config.bucket, key, {
    profile: config.profile,
    region: config.region,
  });

  const sessions: StreamHatchetDailySession[] = [];
  const parseStats = await parseDailySessionCsv({
    filePath: localPath,
    platform: config.platform,
    partitionDate: date,
    rowLimit: config.rowLimit,
    onSession: (session) => {
      sessions.push(session);
    },
  });

  const matches = await loadExistingProfileMatches(config.platform);
  let matchedSessions = 0;
  for (const session of sessions) {
    if (resolveCreatorProfileId(session, matches)) matchedSessions++;
  }

  if (!config.write) {
    log("info", "Dry run complete for date", {
      date: formatDate(date),
      s3RowCount,
      parsedRows: parseStats.rowsAccepted,
      rejectedRows: parseStats.rowsRejected,
      matchedExistingProfiles: matchedSessions,
      objectSize: metadata.size?.toString() ?? null,
      etag: metadata.etag,
    });
    return {
      scanned: parseStats.rowsScanned,
      written: 0,
      skipped: parseStats.rowsAccepted,
      failed: parseStats.rowsRejected,
      matched: matchedSessions,
    };
  }

  const existingObject = await prisma.streamHatchetSourceObject.findUnique({
    where: { bucket_key: { bucket: config.bucket, key } },
  });

  if (
    existingObject &&
    existingObject.status === "completed" &&
    existingObject.etag === metadata.etag &&
    !config.force
  ) {
    log("info", "Object already imported; skipping", {
      key,
      etag: metadata.etag,
    });
    return {
      scanned: 0,
      written: 0,
      skipped: Number(existingObject.importedRows),
      failed: 0,
      matched: 0,
    };
  }

  const sourceObject = await prisma.streamHatchetSourceObject.upsert({
    where: { bucket_key: { bucket: config.bucket, key } },
    update: {
      etag: metadata.etag,
      size: metadata.size,
      lastModified: metadata.lastModified,
      platform: config.platform,
      partitionDate: date,
      status: "running",
      rowCount: s3RowCount,
      errorSummary: null,
      metadata: {
        s3RowCount,
        rowLimit: config.rowLimit ?? null,
      } satisfies Prisma.InputJsonValue,
    },
    create: {
      bucket: config.bucket,
      key,
      etag: metadata.etag,
      size: metadata.size,
      lastModified: metadata.lastModified,
      platform: config.platform,
      partitionDate: date,
      status: "running",
      rowCount: s3RowCount,
      metadata: {
        s3RowCount,
        rowLimit: config.rowLimit ?? null,
      } satisfies Prisma.InputJsonValue,
    },
  });

  if (config.force) {
    await prisma.streamSessionFact.deleteMany({
      where: { sourceObjectId: sourceObject.id },
    });
  }

  let written = 0;
  for (const batch of chunk(sessions, BATCH_SIZE)) {
    const data = batch.map((session) =>
      sessionCreateInput(
        session,
        sourceObject.id,
        resolveCreatorProfileId(session, matches),
      ),
    );
    const result = await prisma.streamSessionFact.createMany({
      data,
      skipDuplicates: true,
    });
    written += result.count;
  }

  const rollups = await recomputeRollups({
    platform: config.platform,
    partitionDate: date,
  });

  await prisma.streamHatchetSourceObject.update({
    where: { id: sourceObject.id },
    data: {
      status: "completed",
      rowCount: s3RowCount ?? parseStats.rowsScanned,
      importedRows: written,
      skippedRows: parseStats.rowsAccepted - written,
      failedRows: parseStats.rowsRejected,
      lastImportedAt: new Date(),
      metadata: {
        s3RowCount,
        parsedRows: parseStats.rowsAccepted,
        matchedExistingProfiles: matchedSessions,
        rollups,
      } satisfies Prisma.InputJsonValue,
    },
  });

  log("info", "Import complete for date", {
    date: formatDate(date),
    parsedRows: parseStats.rowsAccepted,
    written,
    duplicateRows: parseStats.rowsAccepted - written,
    rejectedRows: parseStats.rowsRejected,
    matchedExistingProfiles: matchedSessions,
    ...rollups,
  });

  return {
    scanned: parseStats.rowsScanned,
    written,
    skipped: parseStats.rowsAccepted - written,
    failed: parseStats.rowsRejected,
    matched: matchedSessions,
  };
}

async function main() {
  const config = parseConfig();
  log("info", "Starting StreamHatchet daily session ingestion", {
    platform: config.platform,
    dates: config.dates.map(formatDate),
    bucket: config.bucket,
    prefix: config.prefix,
    profile: config.profile,
    write: config.write,
    force: config.force,
    rowLimit: config.rowLimit ?? null,
  });

  let runId: string | null = null;
  if (config.write) {
    const run = await prisma.ingestionRun.create({
      data: {
        domain: "platform",
        scope: "snapshot",
        jobType: "streamhatchet-daily-sessions",
        platform: config.platform,
        status: "running",
      },
    });
    runId = run.id;
  }

  const summary = {
    scanned: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    matched: 0,
  };

  try {
    for (const date of config.dates) {
      const result = await importOneDate(config, date);
      summary.scanned += result.scanned;
      summary.written += result.written;
      summary.skipped += result.skipped;
      summary.failed += result.failed;
      summary.matched += result.matched;
    }

    if (runId) {
      await prisma.ingestionRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          finishedAt: new Date(),
          recordsScanned: summary.scanned,
          recordsWritten: summary.written,
          recordsSkipped: summary.skipped,
          recordsFailed: summary.failed,
          metadata: {
            matchedExistingProfiles: summary.matched,
            platform: config.platform,
            dates: config.dates.map(formatDate),
          } satisfies Prisma.InputJsonValue,
        },
      });
    }

    log("info", "StreamHatchet ingestion finished", summary);
  } catch (error) {
    if (runId) {
      await prisma.ingestionRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          recordsScanned: summary.scanned,
          recordsWritten: summary.written,
          recordsSkipped: summary.skipped,
          recordsFailed: summary.failed,
          errorSummary:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : String(error),
        },
      });
    }
    throw error;
  }
}

main()
  .catch((error) => {
    log("error", "StreamHatchet ingestion failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
