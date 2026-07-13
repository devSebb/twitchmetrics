/**
 * StreamHatchet Catalog Builder
 *
 * Promotes every distinct StreamHatchet channel that has NO PlatformAccount yet
 * into a solo CreatorProfile + PlatformAccount, carrying the SH fields (handle,
 * display name, logo, country). This is the "born from SH" half of the catalog;
 * the sibling worker `streamhatchet-link-identities` handles channels that match
 * an EXISTING creator (username match). Run the link worker first if you want
 * matches folded into existing profiles before the remainder is promoted solo.
 *
 * Design notes:
 *   - Idempotent: candidates are the channels with no matching PlatformAccount,
 *     so re-runs skip already-promoted channels. Slugs are deterministic
 *     (handle + stable hash of platform:userId), so a partial run resumes cleanly.
 *   - Bulk-safe: client-generated UUIDs + batched createMany (no per-row slug
 *     conflict loop), so it scales to the hundreds of thousands of Twitch/YT rows.
 *   - yt + ytg fold into one `youtube` account (union on platformUserId).
 *   - Visibility gate: `listed` is true only for channels with >= --min-active-days
 *     active days in the last --activity-window-days days. Everyone is ingested;
 *     only real streamers are listed for browse.
 *   - Backfill: after accounts exist, creatorProfileId is stamped onto
 *     StreamSessionFact / ChannelDailyRollup / ChannelGameDailyRollup for ALL
 *     unlinked SH rows (covers both freshly promoted and previously linked ones).
 *
 * Usage:
 *   pnpm worker:streamhatchet-catalog -- --platform kick            # dry run
 *   pnpm worker:streamhatchet-catalog -- --platform kick --write
 *   pnpm worker:streamhatchet-catalog -- --platform all --write
 *   pnpm worker:streamhatchet-catalog -- --platform twitch --limit 5000 --write
 */

import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient, type Platform } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

const SOURCE = "streamhatchet";
const ALL_SH_PLATFORMS = ["kick", "twitch", "yt", "ytg"] as const;
type ShPlatform = (typeof ALL_SH_PLATFORMS)[number];

// SH partition name -> CreatorProfile.primaryPlatform / PlatformAccount.platform
const PLATFORM_MAP: Record<ShPlatform, Platform> = {
  kick: "kick",
  twitch: "twitch",
  yt: "youtube",
  ytg: "youtube",
};

type Config = {
  platforms: ShPlatform[];
  write: boolean;
  limit: number | null;
  minActiveDays: number;
  activityWindowDays: number;
  batchSize: number;
};

type CandidateRow = {
  pf: Platform;
  puid: string;
  username: string;
  display_name: string | null;
  logo: string | null;
  country: string | null;
  total_sessions: bigint;
  total_minutes: bigint;
  peak_viewers: number | null;
  last_stream_at: Date | null;
  active_days: bigint;
};

function argValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseConfig(): Config {
  const platformArg = (argValue("--platform") ?? "all").toLowerCase();
  let platforms: ShPlatform[];
  if (platformArg === "all") {
    platforms = [...ALL_SH_PLATFORMS];
  } else if (platformArg === "youtube") {
    platforms = ["yt", "ytg"];
  } else if ((ALL_SH_PLATFORMS as readonly string[]).includes(platformArg)) {
    platforms = [platformArg as ShPlatform];
  } else {
    throw new Error(
      `Unsupported --platform '${platformArg}'. Use one of: ${ALL_SH_PLATFORMS.join(", ")}, youtube, all.`,
    );
  }

  const limitRaw = argValue("--limit");
  return {
    platforms,
    write: args.includes("--write"),
    limit: limitRaw ? parsePositiveInt(limitRaw, 0) || null : null,
    minActiveDays: parsePositiveInt(argValue("--min-active-days"), 2),
    activityWindowDays: parsePositiveInt(
      argValue("--activity-window-days"),
      30,
    ),
    batchSize: parsePositiveInt(argValue("--batch-size"), 1000),
  };
}

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  const ts = new Date().toISOString();
  const extra = data
    ? ` ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`
    : "";
  console[level](`[${ts}] [streamhatchet-catalog] ${message}${extra}`);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Deterministic 6-char suffix so re-runs produce identical slugs (idempotent) and
// two different channels never collide on the same slug within a bulk insert.
function slugSuffix(pf: Platform, puid: string): string {
  return (
    createHash("sha1")
      .update(`${pf}:${puid}`)
      .digest("hex")
      .slice(0, 8)
      // hex -> base36-ish compact; keep it url-safe and short
      .toLowerCase()
  );
}

function buildSlug(pf: Platform, puid: string, username: string): string {
  const base = slugify(username) || pf;
  return `${base}-${slugSuffix(pf, puid)}`;
}

function platformUrl(pf: Platform, username: string): string | null {
  switch (pf) {
    case "kick":
      return `https://kick.com/${username}`;
    case "twitch":
      return `https://twitch.tv/${username}`;
    case "youtube":
      return `https://youtube.com/@${username}`;
    default:
      return null;
  }
}

/**
 * Aggregate candidate channels: distinct (mapped-platform, platformUserId) SH
 * channels with no existing PlatformAccount. yt+ytg fold into youtube.
 */
async function loadCandidates(config: Config): Promise<CandidateRow[]> {
  const windowStart = new Date(
    Date.now() - config.activityWindowDays * 24 * 60 * 60 * 1000,
  );
  const platformList = Prisma.join(config.platforms);
  const limitClause = config.limit
    ? Prisma.sql`LIMIT ${config.limit}`
    : Prisma.empty;

  return prisma.$queryRaw<CandidateRow[]>`
    WITH base AS (
      SELECT
        (CASE r.platform
          WHEN 'yt' THEN 'youtube'
          WHEN 'ytg' THEN 'youtube'
          ELSE r.platform
        END)::"Platform" AS pf,
        r."platformUserId"      AS puid,
        r."platformUsername"    AS username,
        r."platformDisplayName" AS display_name,
        r."platformLogoUrl"     AS logo,
        r.country               AS country,
        r."sessionCount"        AS session_count,
        r."minutesWatched"      AS minutes_watched,
        r."peakViewers"         AS peak_viewers,
        r."lastStreamAt"        AS last_stream_at,
        r.date                  AS date
      FROM "ChannelDailyRollup" r
      WHERE r.source = ${SOURCE}
        AND r."creatorProfileId" IS NULL
        AND r.platform IN (${platformList})
    ),
    latest AS (
      SELECT DISTINCT ON (pf, puid)
        pf, puid, username, display_name, logo, country
      FROM base
      ORDER BY pf, puid, date DESC, last_stream_at DESC NULLS LAST
    ),
    agg AS (
      SELECT
        pf,
        puid,
        SUM(session_count)::bigint AS total_sessions,
        SUM(minutes_watched)::bigint AS total_minutes,
        MAX(peak_viewers) AS peak_viewers,
        MAX(last_stream_at) AS last_stream_at,
        COUNT(DISTINCT date) FILTER (WHERE date >= ${windowStart})::bigint AS active_days
      FROM base
      GROUP BY pf, puid
    )
    SELECT
      l.pf, l.puid, l.username, l.display_name, l.logo, l.country,
      a.total_sessions, a.total_minutes, a.peak_viewers, a.last_stream_at, a.active_days
    FROM latest l
    JOIN agg a ON a.pf = l.pf AND a.puid = l.puid
    LEFT JOIN "PlatformAccount" pa
      ON pa."platformUserId" = l.puid AND pa.platform = l.pf
    WHERE pa.id IS NULL
    ORDER BY a.total_minutes DESC
    ${limitClause}
  `;
}

function profileCreateInput(row: CandidateRow, config: Config, id: string) {
  const displayName = row.display_name?.trim() || row.username;
  const activeDays = Number(row.active_days);
  return {
    id,
    displayName,
    slug: buildSlug(row.pf, row.puid, row.username),
    avatarUrl: row.logo,
    country: row.country,
    primaryPlatform: row.pf,
    state: "unclaimed" as const,
    snapshotTier: "tier3" as const,
    catalogSource: SOURCE,
    listed: activeDays >= config.minActiveDays,
    isActiveLast30d: activeDays >= 1,
    lastStreamAt: row.last_stream_at,
    searchText: `${displayName} ${row.username}`.toLowerCase(),
  };
}

function accountCreateInput(row: CandidateRow, creatorProfileId: string) {
  return {
    creatorProfileId,
    platform: row.pf,
    platformUserId: row.puid,
    platformUsername: row.username,
    platformDisplayName: row.display_name ?? row.username,
    platformUrl: platformUrl(row.pf, row.username),
    platformAvatarUrl: row.logo,
    lastSyncedAt: row.last_stream_at ?? new Date(),
  };
}

/** Stamp creatorProfileId onto all unlinked SH facts/rollups via their account. */
async function backfillOwnership(config: Config): Promise<{
  streamSessions: number;
  channelRollups: number;
  channelGameRollups: number;
}> {
  let streamSessions = 0;
  let channelRollups = 0;
  let channelGameRollups = 0;

  // Full-table, sequential ownership stamping — one UPDATE per (SH partition,
  // table). Plain equality on t.platform / pa.platform (a CASE in the join is
  // opaque to the planner; per-channel IN-batches force scattered random reads
  // that are brutal on Neon's remote storage). A whole-partition seq scan +
  // hash join to PlatformAccount reads the table in physical order, which is
  // dramatically faster on Neon. Each statement autocommits on its own.
  // yt+ytg are separate iterations that both resolve to the youtube account.
  const tables = [
    "StreamSessionFact",
    "ChannelDailyRollup",
    "ChannelGameDailyRollup",
  ] as const;

  for (const sh of config.platforms) {
    const enumPlatform = PLATFORM_MAP[sh];
    for (const table of tables) {
      const t0 = Date.now();
      const count = await prisma.$executeRawUnsafe(
        `UPDATE "${table}" t
         SET "creatorProfileId" = pa."creatorProfileId"
         FROM "PlatformAccount" pa
         WHERE t."creatorProfileId" IS NULL
           AND t.source = $1
           AND t.platform = $2
           AND pa.platform = $3::"Platform"
           AND pa."platformUserId" = t."platformUserId"`,
        SOURCE,
        sh,
        enumPlatform,
      );
      if (table === "StreamSessionFact") streamSessions += count;
      else if (table === "ChannelDailyRollup") channelRollups += count;
      else channelGameRollups += count;

      log("info", "Ownership backfill (full-table)", {
        platform: sh,
        table,
        linked: count,
        seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
      });
    }
  }

  return { streamSessions, channelRollups, channelGameRollups };
}

async function main() {
  const config = parseConfig();
  log("info", "Starting StreamHatchet catalog build", {
    platforms: config.platforms,
    write: config.write,
    limit: config.limit,
    minActiveDays: config.minActiveDays,
    activityWindowDays: config.activityWindowDays,
    batchSize: config.batchSize,
  });

  const candidates = await loadCandidates(config);
  const wouldList = candidates.filter(
    (c) => Number(c.active_days) >= config.minActiveDays,
  ).length;

  log("info", "Candidate discovery complete", {
    candidates: candidates.length,
    wouldList,
    wouldRemainUnlisted: candidates.length - wouldList,
    byPlatform: config.platforms.map((p) => {
      const pf = PLATFORM_MAP[p];
      return {
        platform: pf,
        count: candidates.filter((c) => c.pf === pf).length,
      };
    }),
    sample: candidates.slice(0, 15).map((c) => ({
      platform: c.pf,
      username: c.username,
      slug: buildSlug(c.pf, c.puid, c.username),
      activeDays: Number(c.active_days),
      minutesWatched: c.total_minutes.toString(),
      peakViewers: c.peak_viewers,
      listed: Number(c.active_days) >= config.minActiveDays,
    })),
  });

  if (!config.write) {
    log("info", "Dry run complete; pass --write to create profiles.");
    return;
  }

  if (candidates.length === 0) {
    log(
      "info",
      "No new profiles to create; running ownership backfill to catch up any unlinked facts...",
    );
    const backfill = await backfillOwnership(config);
    log("info", "Ownership backfill complete", { backfill });
    return;
  }

  const run = await prisma.ingestionRun.create({
    data: {
      domain: "platform",
      scope: "catalog-build",
      jobType: "streamhatchet-catalog-build",
      platform: config.platforms.join(","),
      status: "running",
      recordsScanned: candidates.length,
    },
  });

  let profilesCreated = 0;
  let listedCreated = 0;

  try {
    for (let i = 0; i < candidates.length; i += config.batchSize) {
      const batch = candidates.slice(i, i + config.batchSize);
      const profiles = batch.map((row) => ({
        row,
        input: profileCreateInput(row, config, randomUUID()),
      }));

      const profileResult = await prisma.creatorProfile.createMany({
        data: profiles.map((p) => p.input),
        skipDuplicates: true,
      });
      await prisma.platformAccount.createMany({
        data: profiles.map((p) => accountCreateInput(p.row, p.input.id)),
        skipDuplicates: true,
      });

      profilesCreated += profileResult.count;
      listedCreated += profiles.filter((p) => p.input.listed).length;

      log("info", "Batch promoted", {
        batch: i / config.batchSize + 1,
        created: profileResult.count,
        cumulative: profilesCreated,
      });
    }

    log("info", "Backfilling ownership onto facts and rollups...");
    const backfill = await backfillOwnership(config);

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        recordsWritten: profilesCreated,
        metadata: {
          platforms: config.platforms,
          profilesCreated,
          listedCreated,
          minActiveDays: config.minActiveDays,
          backfill,
        },
      },
    });

    log("info", "Catalog build complete", {
      profilesCreated,
      listedCreated,
      backfill,
    });
  } catch (error) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        recordsWritten: profilesCreated,
        errorSummary:
          error instanceof Error ? error.message.slice(0, 1000) : String(error),
      },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    log("error", "StreamHatchet catalog build failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
