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
 *   pnpm worker:streamhatchet -- --platform twitch --date 2026-05-13 --matched-only --write
 *   pnpm worker:streamhatchet -- --platform yt --start-date 2026-04-10 --end-date 2026-08-15 --fill-missing --write
 *
 * --recompute-rollups  rebuild rollups for a date range from facts already in the
 *                database — no S3 download, no parsing. Used by the Phase C backfill
 *                and after any change to the rollup builder. Honours --platform,
 *                --date / --start-date+--end-date / --days and --matched-only.
 *                Dry-run prints what it would rebuild; --write applies.
 *                Also rebuilds that date's CreatorDailyRollup (merged airtime
 *                across platforms) unless --skip-creator-rollups.
 * --creator-rollups-only  rebuild ONLY CreatorDailyRollup for the date range.
 *                Use after the per-platform rollups are already correct.
 * --force        delete the object's facts and re-import everything, rebuild rollups.
 * --fill-missing re-parse an already-imported object WITHOUT deleting: only rows the
 *                unique key does not yet hold get inserted (createMany skipDuplicates),
 *                then that day's rollups are rebuilt. Used to backfill the yt rows the
 *                old (video-id-less) unique key silently dropped — ~8%/day of concurrent
 *                streams — without rewriting the ~92% that were fine.
 */

import { PrismaClient, Prisma, type Platform } from "@prisma/client";
import {
  recomputeCreatorRollups as coreRecomputeCreatorRollups,
  recomputeRollups as coreRecomputeRollups,
  upsertStreamSessionFacts,
} from "@twitchmetrics/core/rollups";
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
const DB_MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same transient-Neon-error set as the social-profiles worker: the pooled
// connection drops every ~15-20 min on long runs and killed multi-day
// backfills mid-createMany.
function isRetryableDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Server has closed the connection|Transaction already closed|Can't reach database server|Timed out fetching a new connection|connection pool|ECONNRESET|Response from the Engine was empty/i.test(
    msg,
  );
}

/** Retry any idempotent DB op on transient Neon connection/timeout errors. */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = DB_MAX_RETRIES,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryableDbError(e) || attempt > maxRetries) throw e;
      log("warn", "Transient DB error — retrying", {
        attempt,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
      await sleep(1000 * attempt);
    }
  }
}

type ImportConfig = {
  bucket: string;
  prefix: string;
  profile: string;
  region: string | undefined;
  platform: DailySessionPlatform;
  dates: Date[];
  write: boolean;
  force: boolean;
  fillMissing: boolean;
  matchedOnly: boolean;
  recomputeRollupsOnly: boolean;
  creatorRollupsOnly: boolean;
  skipCreatorRollups: boolean;
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
    fillMissing: args.includes("--fill-missing"),
    matchedOnly: args.includes("--matched-only"),
    recomputeRollupsOnly:
      args.includes("--recompute-rollups") ||
      args.includes("--creator-rollups-only"),
    creatorRollupsOnly: args.includes("--creator-rollups-only"),
    skipCreatorRollups: args.includes("--skip-creator-rollups"),
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

function importMode(
  config: Pick<ImportConfig, "matchedOnly">,
): "matched" | "full" {
  return config.matchedOnly ? "matched" : "full";
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

  const accounts = await withRetry(() =>
    prisma.platformAccount.findMany({
      where: { platform: internalPlatform },
      select: {
        id: true,
        platformUserId: true,
        platformUsername: true,
        creatorProfileId: true,
        // Stub-owned accounts (same-platform merge collision) resolve to the
        // canonical creator so their facts never land on a redirect stub.
        creatorProfile: { select: { mergedIntoId: true } },
      },
    }),
  );

  const byPlatformUserId = new Map<string, ExistingProfileMatch>();
  const byUsername = new Map<string, ExistingProfileMatch>();

  for (const account of accounts) {
    const match = {
      accountId: account.id,
      creatorProfileId:
        account.creatorProfile.mergedIntoId ?? account.creatorProfileId,
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
  const idMatch = matches.byPlatformUserId.get(session.platformUserId);
  if (idMatch) return idMatch.creatorProfileId;

  // Username fallback is intentionally limited to KICK. Twitch and YouTube
  // have stable platform IDs in StreamHatchet, so targeted imports should not
  // rely on potentially ambiguous display/user names.
  if (session.platform !== "kick") return null;

  return (
    matches.byUsername.get(session.platformUsername.toLowerCase())
      ?.creatorProfileId ?? null
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

/**
 * Rebuild one partition's rollups. The grouping lives in
 * @twitchmetrics/core/rollups — this worker used to carry a full copy of it,
 * so every rollup change had to be made twice. `retry` keeps the long local
 * backfills alive across Neon connection drops; skipDuplicates makes a
 * retried write batch a no-op.
 */
async function recomputeRollups(input: {
  platform: DailySessionPlatform;
  partitionDate: Date;
  matchedOnly: boolean;
}) {
  return coreRecomputeRollups(prisma, {
    source: SOURCE,
    platform: input.platform,
    partitionDate: input.partitionDate,
    matchedOnly: input.matchedOnly,
    retry: withRetry,
    skipDuplicates: true,
  });
}

async function importOneDate(config: ImportConfig, date: Date) {
  const key = buildDailySessionKey(config.prefix, date, config.platform);
  const mode = importMode(config);
  log("info", "Inspecting S3 object", {
    bucket: config.bucket,
    key,
    write: config.write,
    matchedOnly: config.matchedOnly,
  });

  const metadata = await headS3Object(config.bucket, key, {
    profile: config.profile,
    region: config.region,
  });
  const s3RowCount = await countS3CsvRows(config.bucket, key, {
    profile: config.profile,
    region: config.region,
  });

  const existingObject = await withRetry(() =>
    prisma.streamHatchetSourceObject.findUnique({
      where: { bucket_key: { bucket: config.bucket, key } },
    }),
  );

  if (
    config.write &&
    existingObject &&
    existingObject.status === "completed" &&
    existingObject.etag === metadata.etag &&
    canSkipImportedObject({
      existingMode: metadataImportMode(existingObject.metadata),
      currentMode: mode,
    }) &&
    !config.force &&
    !config.fillMissing
  ) {
    log("info", "Object already imported; skipping", {
      key,
      etag: metadata.etag,
      importMode: metadataImportMode(existingObject.metadata),
      requestedMode: mode,
    });
    return {
      scanned: 0,
      written: 0,
      skipped: Number(existingObject.importedRows),
      failed: 0,
      matched: 0,
    };
  }

  const localPath = await downloadS3Object(config.bucket, key, {
    profile: config.profile,
    region: config.region,
  });

  const matches = await loadExistingProfileMatches(config.platform);
  let matchedSessions = 0;
  let written = 0;
  // Re-sighted streams merged into an existing row (see upsert): not new rows,
  // and not skipped either.
  let updatedSessions = 0;
  let pendingBatch: Prisma.StreamSessionFactCreateManyInput[] = [];

  let sourceObjectId: string | null = null;

  if (!config.write) {
    const parseStats = await parseDailySessionCsv({
      filePath: localPath,
      platform: config.platform,
      partitionDate: date,
      rowLimit: config.rowLimit,
      onSession: (session) => {
        if (resolveCreatorProfileId(session, matches)) matchedSessions++;
      },
    });

    log("info", "Dry run complete for date", {
      date: formatDate(date),
      s3RowCount,
      parsedRows: parseStats.rowsAccepted,
      rejectedRows: parseStats.rowsRejected,
      matchedExistingProfiles: matchedSessions,
      matchedOnly: config.matchedOnly,
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

  const sourceObject = await withRetry(() =>
    prisma.streamHatchetSourceObject.upsert({
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
          importMode: mode,
          matchedOnly: config.matchedOnly,
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
          importMode: mode,
          matchedOnly: config.matchedOnly,
        } satisfies Prisma.InputJsonValue,
      },
    }),
  );
  sourceObjectId = sourceObject.id;

  if (config.force) {
    await withRetry(() =>
      prisma.streamSessionFact.deleteMany({
        where: { sourceObjectId: sourceObject.id },
      }),
    );
  }

  async function flushPendingBatch() {
    if (pendingBatch.length === 0) return;
    // Upsert, not createMany: a stream still live at the export cut is
    // re-sighted in the next file with a slid window, and merges into the row
    // it already has (see upsertStreamSessionFacts).
    const result = await withRetry(() =>
      upsertStreamSessionFacts(prisma, pendingBatch),
    );
    written += result.inserted;
    updatedSessions += result.updated;
    pendingBatch = [];
  }

  const parseStats = await parseDailySessionCsv({
    filePath: localPath,
    platform: config.platform,
    partitionDate: date,
    rowLimit: config.rowLimit,
    onSession: async (session) => {
      const creatorProfileId = resolveCreatorProfileId(session, matches);
      if (creatorProfileId) matchedSessions++;
      if (config.matchedOnly && !creatorProfileId) return;
      pendingBatch.push(
        sessionCreateInput(session, sourceObject.id, creatorProfileId),
      );
      if (pendingBatch.length >= BATCH_SIZE) {
        await flushPendingBatch();
      }
    },
  });
  await flushPendingBatch();

  const rollups = await recomputeRollups({
    platform: config.platform,
    partitionDate: date,
    matchedOnly: config.matchedOnly,
  });

  // In fill-missing mode the rows already present count as imported too;
  // `written` is only the delta this pass added.
  const priorImported =
    config.fillMissing && !config.force
      ? Number(existingObject?.importedRows ?? 0)
      : 0;
  const importedRows = priorImported + written;

  await withRetry(() =>
    prisma.streamHatchetSourceObject.update({
      where: { id: sourceObject.id },
      data: {
        status: "completed",
        rowCount: s3RowCount ?? parseStats.rowsScanned,
        importedRows,
        skippedRows: Math.max(0, parseStats.rowsAccepted - importedRows),
        failedRows: parseStats.rowsRejected,
        lastImportedAt: new Date(),
        metadata: {
          s3RowCount,
          parsedRows: parseStats.rowsAccepted,
          matchedExistingProfiles: matchedSessions,
          matchedOnly: config.matchedOnly,
          importMode: mode,
          sourceObjectId,
          rollups,
        } satisfies Prisma.InputJsonValue,
      },
    }),
  );

  log("info", "Import complete for date", {
    date: formatDate(date),
    parsedRows: parseStats.rowsAccepted,
    written,
    updated: updatedSessions,
    skippedOrDuplicateRows: parseStats.rowsAccepted - written - updatedSessions,
    rejectedRows: parseStats.rowsRejected,
    matchedExistingProfiles: matchedSessions,
    matchedOnly: config.matchedOnly,
    ...rollups,
  });

  return {
    scanned: parseStats.rowsScanned,
    written,
    updated: updatedSessions,
    skipped: parseStats.rowsAccepted - written - updatedSessions,
    failed: parseStats.rowsRejected,
    matched: matchedSessions,
  };
}

/**
 * --recompute-rollups: rebuild each date's rollups straight from the facts
 * already stored. Every other path downloads and re-parses the S3 object
 * first, which is hours of needless work when only the rollup math changed.
 */
async function recomputeRollupsOnly(config: ImportConfig) {
  let channelRollups = 0;
  let gameRollups = 0;
  let channelGameRollups = 0;
  let creatorRollups = 0;

  for (const date of config.dates) {
    const partitionDate = new Date(date);
    partitionDate.setUTCHours(0, 0, 0, 0);

    if (!config.write) {
      const facts = await withRetry(() =>
        prisma.streamSessionFact.count({
          where: { source: SOURCE, platform: config.platform, partitionDate },
        }),
      );
      log("info", "Would rebuild rollups", {
        date: formatDate(partitionDate),
        facts,
        creatorRollups: !config.skipCreatorRollups,
      });
      continue;
    }

    if (!config.creatorRollupsOnly) {
      const rollups = await recomputeRollups({
        platform: config.platform,
        partitionDate,
        matchedOnly: config.matchedOnly,
      });
      channelRollups += rollups.channelRollups;
      gameRollups += rollups.gameRollups;
      channelGameRollups += rollups.channelGameRollups;
      // An interrupted backfill resumes from the last date logged here.
      log("info", "Rollups rebuilt", {
        date: formatDate(partitionDate),
        ...rollups,
      });
    }

    // Per-creator merged airtime spans platforms, so it is rebuilt per date
    // rather than per (platform, date). Running the platforms one after
    // another therefore recomputes this a few times for the same day, which
    // is idempotent.
    if (!config.skipCreatorRollups) {
      const creator = await coreRecomputeCreatorRollups(prisma, {
        source: SOURCE,
        partitionDate,
        retry: withRetry,
      });
      creatorRollups += creator.creatorRollups;
      log("info", "Creator rollups rebuilt", {
        date: formatDate(partitionDate),
        ...creator,
      });
    }
  }

  log("info", "Rollup recompute complete", {
    write: config.write,
    platform: config.platform,
    dates: config.dates.length,
    channelRollups,
    gameRollups,
    channelGameRollups,
    creatorRollups,
  });
}

async function main() {
  const config = parseConfig();

  if (config.recomputeRollupsOnly) {
    log("info", "Rebuilding rollups from stored facts (no S3 read)", {
      platform: config.platform,
      dates: config.dates.map(formatDate),
      matchedOnly: config.matchedOnly,
      write: config.write,
    });
    await recomputeRollupsOnly(config);
    return;
  }

  log("info", "Starting StreamHatchet daily session ingestion", {
    platform: config.platform,
    dates: config.dates.map(formatDate),
    bucket: config.bucket,
    prefix: config.prefix,
    profile: config.profile,
    write: config.write,
    force: config.force,
    fillMissing: config.fillMissing,
    matchedOnly: config.matchedOnly,
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
      // A date is retried as a unit on ANY failure (S3 download resets, Neon
      // drops mid-batch): the import is idempotent (ETag ledger + unique key +
      // rollup rebuild), so replaying a date is always safe. Long backoff so a
      // laptop sleep / network blip doesn't kill a multi-hour backfill.
      let result: Awaited<ReturnType<typeof importOneDate>> | null = null;
      for (let attempt = 1; ; attempt++) {
        try {
          result = await importOneDate(config, date);
          break;
        } catch (err) {
          if (attempt >= 8) throw err;
          const waitMs = Math.min(300_000, 15_000 * 2 ** (attempt - 1));
          log("warn", "Date import failed; retrying", {
            date: formatDate(date),
            attempt,
            waitMs,
            error:
              err instanceof Error ? err.message.split("\n")[0] : String(err),
          });
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
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
            matchedOnly: config.matchedOnly,
            importMode: importMode(config),
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
