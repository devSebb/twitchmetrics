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
  // Ownership backfill is stamped in bounded date windows (not one giant
  // whole-table UPDATE) so each statement commits on its own, stays resumable,
  // and leaves I/O headroom for the live app on shared prod Neon.
  backfillWindowDays: number;
  backfillSleepMs: number;
  // Watchdog: a single window UPDATE that exceeds this (default 5 min) is
  // treated as a hung/dropped connection — we reconnect and retry the window
  // (up to backfillMaxRetries) instead of stalling forever. Windows commit
  // independently, so a retry re-links only the still-unlinked rows.
  backfillWindowTimeoutMs: number;
  backfillMaxRetries: number;
  // Candidate discovery is a single heavy aggregation; cap it so a pathological
  // run (e.g. yt+ytg's full unlinked set) fails fast instead of hanging for hours.
  candidateTimeoutMs: number;
  // Skip candidate discovery + profile creation and run only the ownership
  // backfill — for cheaply resuming an interrupted backfill without re-paying
  // the (heavy) discovery scan. Requires --write.
  backfillOnly: boolean;
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
    backfillWindowDays: parsePositiveInt(argValue("--backfill-window-days"), 1),
    backfillSleepMs: parsePositiveInt(argValue("--backfill-sleep-ms"), 250),
    backfillWindowTimeoutMs: parsePositiveInt(
      argValue("--backfill-window-timeout-ms"),
      300_000,
    ),
    backfillMaxRetries: parsePositiveInt(argValue("--backfill-max-retries"), 2),
    candidateTimeoutMs: parsePositiveInt(
      argValue("--candidate-timeout-ms"),
      900_000,
    ),
    backfillOnly: args.includes("--backfill-only"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reject if `promise` doesn't settle within `ms` (turns a silent hang into an error). */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`operation timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run a DB op with a hang watchdog + reconnect-retry. A timed-out or dropped
 * connection is retried (up to maxRetries) after disconnecting so the next call
 * reconnects — turns a silent multi-hour stall into a bounded, self-healing op.
 */
async function withReconnectRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  maxRetries: number,
  label: Record<string, unknown>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      if (attempt > maxRetries) throw err;
      log("warn", "DB op failed — reconnecting + retrying", {
        ...label,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      // Bound $disconnect itself: a query wedged on a dropped Neon connection
      // makes $disconnect() block forever waiting for it to drain, which is the
      // exact silent-hang we're guarding against. Abandon it after 30s; the
      // next query reconnects via a fresh pool connection regardless.
      try {
        await withTimeout(prisma.$disconnect(), 30_000);
      } catch {
        /* disconnect hung or failed; next query reconnects automatically */
      }
      await sleep(2000 * attempt);
    }
  }
}

// YYYY-MM-DD in UTC (matches @db.Date columns).
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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

// Deterministic hash suffix so re-runs produce identical slugs (idempotent) and
// two different channels never collide on the same slug within a bulk insert.
// 16 hex chars (64 bits): non-Latin usernames slugify to empty and collapse to
// base = platform, so uniqueness rests entirely on this suffix — at hundreds of
// thousands of channels an 8-hex (32-bit) suffix collides (birthday paradox),
// which silently dropped profiles and orphaned their accounts. 64 bits is
// collision-free at our scale.
function slugSuffix(pf: Platform, puid: string): string {
  return createHash("sha1")
    .update(`${pf}:${puid}`)
    .digest("hex")
    .slice(0, 16)
    .toLowerCase();
}

function buildSlug(pf: Platform, puid: string, username: string): string {
  const base = slugify(username) || pf;
  return `${base}-${slugSuffix(pf, puid)}`;
}

function platformUrl(
  pf: Platform,
  puid: string,
  username: string,
): string | null {
  switch (pf) {
    case "kick":
      return `https://kick.com/${username}`;
    case "twitch":
      return `https://twitch.tv/${username}`;
    case "youtube":
      // SH's yt `username` is the channel TITLE, not the @handle — an @URL
      // built from it points at the wrong channel. The id URL always works.
      return /^UC[\w-]{22}$/.test(puid)
        ? `https://www.youtube.com/channel/${puid}`
        : null;
    default:
      return null;
  }
}

type DailyRollupRow = {
  pf: Platform;
  puid: string;
  username: string;
  display_name: string | null;
  logo: string | null;
  country: string | null;
  session_count: number;
  minutes_watched: bigint;
  peak_viewers: number | null;
  last_stream_at: Date | null;
};

type CandidateAcc = {
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
  active_days: number;
  latest_date: number; // ms of the most recent rollup date seen (for identity)
};

/**
 * Aggregate candidate channels: distinct (mapped-platform, platformUserId) SH
 * channels with no existing PlatformAccount. yt+ytg fold into youtube.
 *
 * Done as a windowed accumulation rather than one giant GROUP BY: a single
 * whole-table aggregation over the unlinked YouTube rollups (esp. ytg's ~10x
 * volume) thrashes Neon's compute and times out. Instead we read ONE day at a
 * time (bounded, index-friendly) and fold per-channel aggregates into an
 * in-memory map — each daily read is fast, retryable, and never a multi-hour
 * hang. Since ChannelDailyRollup is unique on (source, platform, date, puid),
 * a 1-day window yields at most one row per channel, so folding is trivial.
 */
async function loadCandidates(config: Config): Promise<CandidateRow[]> {
  const windowStartMs =
    Date.now() - config.activityWindowDays * 24 * 60 * 60 * 1000;
  const platformList = Prisma.join(config.platforms);

  // Date range of rows still awaiting a profile.
  const bounds = await withReconnectRetry(
    () =>
      prisma.$queryRaw<{ lo: Date | null; hi: Date | null }[]>`
        SELECT MIN(r.date) AS lo, MAX(r.date) AS hi
        FROM "ChannelDailyRollup" r
        WHERE r.source = ${SOURCE}
          AND r."creatorProfileId" IS NULL
          AND r.platform IN (${platformList})`,
    config.candidateTimeoutMs,
    config.backfillMaxRetries,
    { phase: "candidate-bounds" },
  );
  const lo = bounds[0]?.lo ?? null;
  const hi = bounds[0]?.hi ?? null;
  if (!lo || !hi) return [];

  const acc = new Map<string, CandidateAcc>();
  const lastWindowStart = utcMidnight(hi);
  let cursor = utcMidnight(lo);
  let windows = 0;

  while (cursor <= lastWindowStart) {
    const next = addDays(cursor, 1);
    const from = isoDate(cursor);
    const to = isoDate(next);
    const dateMs = cursor.getTime();
    const isActiveWindow = dateMs >= windowStartMs;

    const rows = await withReconnectRetry(
      () =>
        prisma.$queryRaw<DailyRollupRow[]>`
          SELECT
            (CASE r.platform WHEN 'yt' THEN 'youtube' WHEN 'ytg' THEN 'youtube' ELSE r.platform END)::"Platform" AS pf,
            r."platformUserId"      AS puid,
            r."platformUsername"    AS username,
            r."platformDisplayName" AS display_name,
            r."platformLogoUrl"     AS logo,
            r.country               AS country,
            r."sessionCount"        AS session_count,
            r."minutesWatched"      AS minutes_watched,
            r."peakViewers"         AS peak_viewers,
            r."lastStreamAt"        AS last_stream_at
          FROM "ChannelDailyRollup" r
          WHERE r.source = ${SOURCE}
            AND r."creatorProfileId" IS NULL
            AND r.platform IN (${platformList})
            AND r.date >= ${from}::date
            AND r.date <  ${to}::date`,
      config.candidateTimeoutMs,
      config.backfillMaxRetries,
      { phase: "candidate-window", window: from },
    );

    for (const r of rows) {
      const key = `${r.pf}:${r.puid}`;
      let a = acc.get(key);
      if (!a) {
        a = {
          pf: r.pf,
          puid: r.puid,
          username: r.username,
          display_name: r.display_name,
          logo: r.logo,
          country: r.country,
          total_sessions: 0n,
          total_minutes: 0n,
          peak_viewers: null,
          last_stream_at: null,
          active_days: 0,
          latest_date: 0,
        };
        acc.set(key, a);
      }
      a.total_sessions += BigInt(r.session_count ?? 0);
      a.total_minutes += BigInt(r.minutes_watched ?? 0);
      if (
        r.peak_viewers != null &&
        (a.peak_viewers == null || r.peak_viewers > a.peak_viewers)
      ) {
        a.peak_viewers = r.peak_viewers;
      }
      if (
        r.last_stream_at &&
        (!a.last_stream_at || r.last_stream_at > a.last_stream_at)
      ) {
        a.last_stream_at = r.last_stream_at;
      }
      if (isActiveWindow) a.active_days += 1;
      if (dateMs > a.latest_date) {
        a.latest_date = dateMs;
        a.username = r.username;
        a.display_name = r.display_name;
        a.logo = r.logo;
        a.country = r.country;
      }
    }

    windows++;
    if (windows % 15 === 0 || cursor >= lastWindowStart) {
      log("info", "Candidate discovery progress", {
        window: from,
        channelsSoFar: acc.size,
      });
    }
    cursor = next;
    if (config.backfillSleepMs > 0) await sleep(config.backfillSleepMs);
  }

  // Exclude channels that already have a PlatformAccount on these platforms.
  const enumPlatforms = [
    ...new Set(config.platforms.map((p) => PLATFORM_MAP[p])),
  ];
  const existing = await prisma.platformAccount.findMany({
    where: { platform: { in: enumPlatforms } },
    select: { platform: true, platformUserId: true },
  });
  const existingKeys = new Set(
    existing.map((e) => `${e.platform}:${e.platformUserId}`),
  );

  const candidates: CandidateRow[] = [];
  for (const a of acc.values()) {
    if (existingKeys.has(`${a.pf}:${a.puid}`)) continue;
    candidates.push({
      pf: a.pf,
      puid: a.puid,
      username: a.username,
      display_name: a.display_name,
      logo: a.logo,
      country: a.country,
      total_sessions: a.total_sessions,
      total_minutes: a.total_minutes,
      peak_viewers: a.peak_viewers,
      last_stream_at: a.last_stream_at,
      active_days: BigInt(a.active_days),
    });
  }
  candidates.sort((x, y) =>
    y.total_minutes > x.total_minutes
      ? 1
      : y.total_minutes < x.total_minutes
        ? -1
        : 0,
  );
  return config.limit ? candidates.slice(0, config.limit) : candidates;
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
    platformUrl: platformUrl(row.pf, row.puid, row.username),
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

  // Ownership stamping, batched by date window instead of one whole-table
  // UPDATE. Each table has a (platform, <date>)-leading index and rows are
  // physically clustered by ingestion day, so a per-window UPDATE reads only
  // that window's (adjacent) pages — keeping reads local WITHOUT the scattered
  // random-read penalty of per-channel IN-batches. Every window commits on its
  // own (resumable via the `creatorProfileId IS NULL` filter) and we sleep
  // between windows to leave I/O headroom for the live app on shared prod Neon.
  // yt+ytg are separate iterations that both resolve to the youtube account.
  const tables = [
    { name: "StreamSessionFact", dateCol: "partitionDate" },
    { name: "ChannelDailyRollup", dateCol: "date" },
    { name: "ChannelGameDailyRollup", dateCol: "date" },
  ] as const;

  for (const sh of config.platforms) {
    const enumPlatform = PLATFORM_MAP[sh];
    for (const { name, dateCol } of tables) {
      // Bound the loop to the date range of rows still awaiting ownership.
      // Guarded by the same watchdog as the window UPDATEs: this MIN/MAX over
      // all-unlinked rollups is a cold full-range scan that Neon can drop the
      // connection on — unguarded it awaits forever (silent hang at each table
      // transition). withReconnectRetry turns that into a bounded, self-healing op.
      const bounds = await withReconnectRetry(
        () =>
          prisma.$queryRawUnsafe<{ lo: Date | null; hi: Date | null }[]>(
            `SELECT MIN("${dateCol}") AS lo, MAX("${dateCol}") AS hi
             FROM "${name}"
             WHERE "creatorProfileId" IS NULL AND source = $1 AND platform = $2`,
            SOURCE,
            sh,
          ),
        config.candidateTimeoutMs,
        config.backfillMaxRetries,
        { phase: "backfill-bounds", platform: sh, table: name },
      );
      const lo = bounds[0]?.lo ?? null;
      const hi = bounds[0]?.hi ?? null;
      if (!lo || !hi) {
        log("info", "Ownership backfill — nothing to link", {
          platform: sh,
          table: name,
        });
        continue;
      }

      let tableLinked = 0;
      const lastWindowStart = utcMidnight(hi);
      let cursor = utcMidnight(lo);
      while (cursor <= lastWindowStart) {
        const next = addDays(cursor, config.backfillWindowDays);
        const runWindow = () =>
          prisma.$executeRawUnsafe(
            `UPDATE "${name}" t
             SET "creatorProfileId" = pa."creatorProfileId"
             FROM "PlatformAccount" pa
             WHERE t."creatorProfileId" IS NULL
               AND t.source = $1
               AND t.platform = $2
               AND t."${dateCol}" >= $3::date
               AND t."${dateCol}" < $4::date
               AND pa.platform = $5::"Platform"
               AND pa."platformUserId" = t."platformUserId"`,
            SOURCE,
            sh,
            isoDate(cursor),
            isoDate(next),
            enumPlatform,
          );

        // Watchdog + reconnect-retry: turn a silent hung/dropped connection
        // into a bounded failure. Each window commits on its own, so a retry
        // simply re-links whatever is still unlinked in that window.
        const t0 = Date.now();
        const count = await withReconnectRetry(
          runWindow,
          config.backfillWindowTimeoutMs,
          config.backfillMaxRetries,
          {
            phase: "backfill",
            platform: sh,
            table: name,
            window: isoDate(cursor),
          },
        );
        tableLinked += count;
        log("info", "Ownership backfill (window)", {
          platform: sh,
          table: name,
          window: isoDate(cursor),
          linked: count,
          seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
        });
        cursor = next;
        if (config.backfillSleepMs > 0) await sleep(config.backfillSleepMs);
      }

      if (name === "StreamSessionFact") streamSessions += tableLinked;
      else if (name === "ChannelDailyRollup") channelRollups += tableLinked;
      else channelGameRollups += tableLinked;

      log("info", "Ownership backfill — table complete", {
        platform: sh,
        table: name,
        linked: tableLinked,
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

  if (config.backfillOnly) {
    if (!config.write) {
      log(
        "info",
        "--backfill-only requires --write (it mutates ownership); nothing to do in dry run.",
      );
      return;
    }
    log("info", "Backfill-only: skipping candidate discovery + creation.");
    const backfill = await backfillOwnership(config);
    log("info", "Ownership backfill complete", { backfill });
    return;
  }

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
      const built = batch.map((row) => ({
        row,
        input: profileCreateInput(row, config, randomUUID()),
      }));

      // De-orphan the insert: a PlatformAccount references its profile's id, but
      // createMany(skipDuplicates) silently drops a profile whose slug already
      // exists — leaving the account with a dangling FK. So we only ever insert
      // profile+account pairs whose slug is genuinely new: dedupe within the
      // batch, then drop any slug that already exists in the DB.
      const bySlug = new Map<string, (typeof built)[number]>();
      for (const b of built) {
        if (!bySlug.has(b.input.slug)) bySlug.set(b.input.slug, b);
      }
      const existing = await prisma.creatorProfile.findMany({
        where: { slug: { in: [...bySlug.keys()] } },
        select: { slug: true },
      });
      for (const e of existing) bySlug.delete(e.slug);

      const toCreate = [...bySlug.values()];
      if (toCreate.length === 0) continue;

      await prisma.creatorProfile.createMany({
        data: toCreate.map((p) => p.input),
        skipDuplicates: true,
      });
      await prisma.platformAccount.createMany({
        data: toCreate.map((p) => accountCreateInput(p.row, p.input.id)),
        skipDuplicates: true,
      });

      profilesCreated += toCreate.length;
      listedCreated += toCreate.filter((p) => p.input.listed).length;

      log("info", "Batch promoted", {
        batch: i / config.batchSize + 1,
        created: toCreate.length,
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
