import {
  prisma,
  type SnapshotTier,
  type Platform,
} from "@twitchmetrics/database";
import {
  AdapterError,
  type CreatorSnapshotData,
} from "@/server/adapters/types";
import { decryptToken } from "@/lib/encryption";
import { createLogger } from "@/lib/logger";
import { getAdapter } from "@/server/adapters";
import {
  getTwitchRateStats,
  withTwitchPriority,
} from "@/server/adapters/twitch-rate";
import {
  fetchChannelsByIds,
  youtubeSnapshotFromStats,
  YOUTUBE_CHANNELS_PER_CALL,
  type YouTubeChannelStats,
} from "@/server/adapters/youtube";
import {
  cacheInvalidateOrThrow,
  isCacheConfigured,
} from "@/server/services/cache";
import { invalidateCreatorCacheOrThrow } from "@/server/services/creator-cache";
import type { IngestionRunSummary } from "@/server/services/ingestion/runs";
import { recomputeCreatorAggregates } from "@twitchmetrics/core/creator-aggregates";
import { recomputeCreatorGrowthRollups } from "@/server/services/creator-growth";
import { supportsCreatorSnapshots } from "@/server/services/ingestion/constants";
import { refreshCreatorClips } from "@/server/services/clip-sync";

const log = createLogger("snapshot-worker");

const BATCH_SIZE = 50;
// Consecutive "channel does not exist" results before an account stops being
// polled. Deleted/banned Twitch channels were ~2,540 failures a day.
const NOT_FOUND_SKIP_THRESHOLD = 3;

function toJsonValue(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  );
}

type SnapshotableProfile = {
  id: string;
  totalFollowers: bigint;
  snapshotTier: SnapshotTier;
  platformAccounts: Array<{
    id: string;
    platform: Platform;
    platformUserId: string;
    isOAuthConnected: boolean;
    accessToken: string | null;
    notFoundCount: number;
  }>;
};

function isNotFoundError(err: unknown): boolean {
  return err instanceof AdapterError && err.code === "not_found";
}

// Inngest step tools type is complex with deep conditional types.
// Using a minimal structural type avoids tight coupling to Inngest internals.
type StepTools = {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sleep: (name: string, duration: string) => Promise<unknown>;
};

export type TierSnapshotOptions = {
  /** Poll only one shard of the tier (GitHub runs tier3 as 2 shards). */
  shard?: { index: number; count: number };
  /**
   * Skip accounts that already have a MetricSnapshot at or after this time,
   * so re-running after a partial or failed run doesn't write a second one.
   */
  resumeSince?: Date;
  /**
   * Stop starting new batches after this long. GitHub only: under Inngest
   * each step is a fresh request, so a wall clock differs per replay.
   */
  timeBudgetMs?: number;
  /**
   * Profiles of a batch polled at once (default 1, one after another). The
   * GitHub runner sits farther from the database than Vercel, so each
   * profile's 8-10 sequential queries cost more there; overlapping a few
   * profiles hides that latency. Inngest keeps 1: a batch step must finish
   * inside Vercel's 300 s cap and its behaviour must not change. Twitch
   * pacing still applies per call, so overlapping can't eat the reserve.
   */
  profileConcurrency?: number;
};

/**
 * Where a batch's time went. The *Ms fields are summed over profiles, so
 * with profileConcurrency > 1 they add up to more than the wall time.
 * Twitch figures come from the process-wide pacing stats: on Vercel they
 * can include other functions running in the same instance.
 */
export type TierBatchTiming = {
  wallMs: number;
  /** The batched YouTube channels.list lookups, before the profiles. */
  youtubeMs: number;
  twitchWaitMs: number;
  twitchHttpMs: number;
  /** Everything else in the profiles: database writes, aggregates, cache. */
  dbAndOtherMs: number;
};

const NO_TIME: TierBatchTiming = {
  wallMs: 0,
  youtubeMs: 0,
  twitchWaitMs: 0,
  twitchHttpMs: 0,
  dbAndOtherMs: 0,
};

function addTiming(a: TierBatchTiming, b: TierBatchTiming): TierBatchTiming {
  return {
    wallMs: a.wallMs + b.wallMs,
    youtubeMs: a.youtubeMs + b.youtubeMs,
    twitchWaitMs: a.twitchWaitMs + b.twitchWaitMs,
    twitchHttpMs: a.twitchHttpMs + b.twitchHttpMs,
    dbAndOtherMs: a.dbAndOtherMs + b.dbAndOtherMs,
  };
}

export type TierSnapshotResult = {
  tier: SnapshotTier;
  processed: number;
  errors: number;
  /** Accounts skipped by resumeSince (already snapshotted). */
  resumed: number;
  profilesTotal: number;
  profilesReached: number;
  stoppedByTimeBudget: boolean;
  /** "on", or why invalidation was switched off during the run. */
  cacheInvalidation: string;
  /** Batch timings added up (see TierBatchTiming). */
  timing: TierBatchTiming;
};

const DAY_MS = 86_400_000;

/**
 * Run `fn` over `items`, at most `limit` at a time. limit 1 is a plain
 * sequential loop, exactly the behaviour before overlapping existed.
 */
async function forEachLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (limit <= 1) {
    for (const item of items) await fn(item);
    return;
  }
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await fn(items[next++]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

/** Stable shard of a profile id: UUIDs end in random hex. */
export function profileShard(id: string, count: number): number {
  const tail = Number.parseInt(id.replace(/-/g, "").slice(-6), 16);
  if (!Number.isNaN(tail)) return tail % count;
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % count;
}

/**
 * Cache invalidation that can never fail a run. The first Redis error (the
 * Upstash request cap is exhausted as of 2026-10) or missing Upstash env
 * switches it off for the rest of the run: one log line instead of one
 * failed call per creator. Cached entries expire within 5 minutes anyway
 * (CACHE_TTL), so a skipped invalidation only delays freshness that long.
 */
function createRunCacheInvalidator() {
  let off: string | null = isCacheConfigured() ? null : "not configured";
  let skipped = 0;

  async function guard(what: string, fn: () => Promise<unknown>) {
    if (off) {
      skipped++;
      return;
    }
    try {
      await fn();
    } catch (err) {
      off = err instanceof Error ? err.message.slice(0, 120) : String(err);
      skipped++;
      log.warn(
        { err, what },
        "Cache invalidation failed — off for the rest of this run",
      );
    }
  }

  return {
    creator: (slug: string) =>
      guard(`creator:${slug}`, () => invalidateCreatorCacheOrThrow(slug)),
    pattern: (pattern: string) =>
      guard(pattern, () => cacheInvalidateOrThrow(pattern)),
    status: () => (off ? `off (${off}); skipped ${skipped}` : "on"),
  };
}

type RunCacheInvalidator = ReturnType<typeof createRunCacheInvalidator>;

/**
 * The profile ids a tier run polls, in polling order. It starts at a
 * different batch each UTC day, so a run cut short by its time budget leaves
 * a different tail unpolled, never the same one.
 */
export async function loadTierProfileIds(
  tier: SnapshotTier,
  shard?: TierSnapshotOptions["shard"],
  now: number = Date.now(),
): Promise<string[]> {
  const rows = await prisma.creatorProfile.findMany({
    where: {
      snapshotTier: tier,
      mergedIntoId: null,
      // Unclaimed StreamHatchet-catalog profiles get sessions/viewers from
      // the SH S3 pipeline; polling ~1M of them here can never fit API
      // quotas or Inngest step caps. API-poll only API-born profiles plus
      // anything claimed or OAuth-connected.
      OR: [
        { catalogSource: { not: "streamhatchet" } },
        { catalogSource: null },
        { state: { in: ["claimed", "premium"] } },
        { userId: { not: null } },
        { platformAccounts: { some: { isOAuthConnected: true } } },
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const ids = rows
    .map((row) => row.id)
    .filter((id) => !shard || profileShard(id, shard.count) === shard.index);
  const batches = Math.ceil(ids.length / BATCH_SIZE);
  const offset =
    batches > 0 ? (Math.floor(now / DAY_MS) % batches) * BATCH_SIZE : 0;
  return [...ids.slice(offset), ...ids.slice(0, offset)];
}

export async function runTierSnapshot(
  tier: SnapshotTier,
  step: StepTools,
  options: TierSnapshotOptions = {},
): Promise<TierSnapshotResult> {
  const startedAt = Date.now();
  const shard = options.shard;
  const resumeSince = options.resumeSince?.toISOString() ?? null;

  // Only profile ids go through the step output: full rows (accounts + tokens)
  // for a whole tier blow Inngest's 4MB step-output cap — tier3 died this way
  // for months once the catalog passed ~30k profiles.
  const profileIds = (await step.run(`fetch-${tier}-profiles`, () =>
    loadTierProfileIds(tier, shard, startedAt),
  )) as string[];

  const cache = createRunCacheInvalidator();
  let processed = 0;
  let errors = 0;
  let resumed = 0;
  let profilesReached = 0;
  let stoppedByTimeBudget = false;
  let timing = NO_TIME;
  const profileConcurrency = Math.max(1, options.profileConcurrency ?? 1);
  const shardTag = shard ? `-s${shard.index}of${shard.count}` : "";

  for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
    if (
      options.timeBudgetMs != null &&
      Date.now() - startedAt > options.timeBudgetMs
    ) {
      stoppedByTimeBudget = true;
      break;
    }
    const batchIds = profileIds.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);

    // Each batch step loads its own accounts and returns its counts —
    // mutating outer counters inside step.run loses them on memoized
    // replays. No dedicated sleep steps: they doubled the step count past
    // Inngest's 1000-step cap, and a batch already takes long enough to
    // pace the platform APIs.
    const batchResult = (await step.run(
      `snapshot-batch-${tier}${shardTag}-${batchIndex}`,
      () =>
        withTwitchPriority("tier", () =>
          snapshotProfileBatch(
            batchIds,
            cache,
            resumeSince,
            profileConcurrency,
          ),
        ),
    )) as BatchResult;

    processed += batchResult.processed;
    errors += batchResult.errors;
    resumed += batchResult.resumed ?? 0;
    profilesReached += batchIds.length;
    // Batches memoized before timing existed have none.
    if (batchResult.timing) {
      timing = addTiming(timing, batchResult.timing);
      log.info(
        {
          tier,
          batchIndex,
          profiles: batchIds.length,
          profileConcurrency,
          accounts: batchResult.processed + batchResult.errors,
          ...batchResult.timing,
        },
        "Tier batch timing",
      );
    }
  }

  // Invalidate trending/landing cache after a full tier batch
  await cache.pattern("trending:landing*");

  const result: TierSnapshotResult = {
    tier,
    processed,
    errors,
    resumed,
    profilesTotal: profileIds.length,
    profilesReached,
    stoppedByTimeBudget,
    cacheInvalidation: cache.status(),
    timing,
  };
  log.info({ ...result, shard }, "Tier snapshot completed");
  return result;
}

/**
 * The IngestionRun summary for a tier run, the same for both runners so the
 * health checks read one shape. A run cut short by its time budget is
 * `degraded`, with the profiles it never reached as partialCount.
 */
export function tierRunSummary(
  result: TierSnapshotResult,
  meta: { runner: "inngest" | "github"; shard?: TierSnapshotOptions["shard"] },
): IngestionRunSummary {
  const unreached = result.profilesTotal - result.profilesReached;
  return {
    ...(result.stoppedByTimeBudget
      ? {
          status: "degraded" as const,
          errorSummary: `time budget reached: ${unreached} of ${result.profilesTotal} profiles not polled`,
        }
      : {}),
    recordsScanned: result.processed + result.errors,
    recordsWritten: result.processed,
    recordsFailed: result.errors,
    recordsSkipped: result.resumed,
    partialCount: unreached,
    metadata: {
      runner: meta.runner,
      ...(meta.shard
        ? { shard: `${meta.shard.index}/${meta.shard.count}` }
        : {}),
      profilesTotal: result.profilesTotal,
      profilesReached: result.profilesReached,
      cacheInvalidation: result.cacheInvalidation,
      timing: result.timing,
    },
  };
}

/** A YouTube channel the batch lookup didn't return (deleted/terminated). */
const YOUTUBE_MISSING = Symbol("youtube-missing");

type PrefetchedSnapshot = CreatorSnapshotData | typeof YOUTUBE_MISSING;

/**
 * One channels.list call per 50 YouTube accounts (1 quota unit each) instead
 * of one per account. Null when the lookup failed: each account then goes
 * through the adapter on its own, as before.
 */
async function prefetchYouTube(
  channelIds: string[],
): Promise<Map<string, YouTubeChannelStats> | null> {
  if (channelIds.length === 0) return null;
  try {
    const out = new Map<string, YouTubeChannelStats>();
    for (let i = 0; i < channelIds.length; i += YOUTUBE_CHANNELS_PER_CALL) {
      const found = await fetchChannelsByIds(
        channelIds.slice(i, i + YOUTUBE_CHANNELS_PER_CALL),
      );
      for (const [id, stats] of found) out.set(id, stats);
    }
    return out;
  } catch (err) {
    log.warn(
      { err, accounts: channelIds.length },
      "YouTube batch lookup failed — falling back to one call per account",
    );
    return null;
  }
}

type BatchResult = {
  processed: number;
  errors: number;
  resumed: number;
  timing?: TierBatchTiming;
};

async function snapshotProfileBatch(
  profileIds: string[],
  cache: RunCacheInvalidator,
  resumeSince: string | null,
  profileConcurrency: number,
): Promise<BatchResult> {
  const batchStartedAt = Date.now();
  const twitchBefore = getTwitchRateStats();
  const profiles: SnapshotableProfile[] = await prisma.creatorProfile.findMany({
    where: { id: { in: profileIds } },
    select: {
      id: true,
      totalFollowers: true,
      snapshotTier: true,
      platformAccounts: {
        // Link-only accounts from the StreamHatchet social graph (IG/TikTok/X
        // handles + reach) have no adapter session and must never be polled;
        // X in particular has a public adapter that fails on every one of
        // them, which used to show up as ~2.8k "failed" per tier1 run.
        // notFoundCount: an account the platform keeps reporting as gone
        // (deleted/banned) is dropped from the rotation until it comes back
        // via OAuth reconnect.
        where: {
          discoverySource: null,
          notFoundCount: { lt: NOT_FOUND_SKIP_THRESHOLD },
        },
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          isOAuthConnected: true,
          accessToken: true,
          notFoundCount: true,
        },
      },
    },
  });

  // Accounts a previous attempt of this run already snapshotted.
  const done = new Set<string>();
  if (resumeSince) {
    const existing = await prisma.metricSnapshot.findMany({
      where: {
        creatorProfileId: { in: profileIds },
        snapshotAt: { gte: new Date(resumeSince) },
      },
      select: { creatorProfileId: true, platform: true },
      distinct: ["creatorProfileId", "platform"],
    });
    for (const row of existing) {
      done.add(`${row.creatorProfileId}:${row.platform}`);
    }
  }
  const isDone = (profileId: string, platform: Platform) =>
    done.has(`${profileId}:${platform}`);

  const youtubeStartedAt = Date.now();
  const youtube = await prefetchYouTube(
    profiles.flatMap((profile) =>
      profile.platformAccounts
        .filter(
          (account) =>
            account.platform === "youtube" &&
            !isDone(profile.id, account.platform),
        )
        .map((account) => account.platformUserId),
    ),
  );
  const youtubeMs = Date.now() - youtubeStartedAt;
  const youtubeSnapshotAt = new Date();

  // Each profile returns its own counts; nothing is shared between
  // profiles that overlap.
  const results: Array<{
    processed: number;
    errors: number;
    resumed: number;
    ms: number;
  }> = [];

  await forEachLimited(profiles, profileConcurrency, async (profile) => {
    const startedAt = Date.now();
    const counts = await snapshotOneProfile(
      profile,
      cache,
      isDone,
      youtube,
      youtubeSnapshotAt,
    );
    results.push({ ...counts, ms: Date.now() - startedAt });
  });

  const twitchAfter = getTwitchRateStats();
  const twitchWaitMs = twitchAfter.waitMs - twitchBefore.waitMs;
  const twitchHttpMs = twitchAfter.httpMs - twitchBefore.httpMs;
  const profileMs = results.reduce((sum, r) => sum + r.ms, 0);

  return {
    processed: results.reduce((sum, r) => sum + r.processed, 0),
    errors: results.reduce((sum, r) => sum + r.errors, 0),
    resumed: results.reduce((sum, r) => sum + r.resumed, 0),
    timing: {
      wallMs: Date.now() - batchStartedAt,
      youtubeMs,
      twitchWaitMs,
      twitchHttpMs,
      dbAndOtherMs: Math.max(0, profileMs - twitchWaitMs - twitchHttpMs),
    },
  };
}

async function snapshotOneProfile(
  profile: SnapshotableProfile,
  cache: RunCacheInvalidator,
  isDone: (profileId: string, platform: Platform) => boolean,
  youtube: Map<string, YouTubeChannelStats> | null,
  youtubeSnapshotAt: Date,
): Promise<{ processed: number; errors: number; resumed: number }> {
  let processed = 0;
  let errors = 0;
  let resumed = 0;
  let polled = 0;
  for (const account of profile.platformAccounts) {
    if (isDone(profile.id, account.platform)) {
      resumed++;
      continue;
    }
    polled++;
    let prefetched: PrefetchedSnapshot | undefined;
    if (account.platform === "youtube" && youtube) {
      const stats = youtube.get(account.platformUserId);
      prefetched = stats
        ? youtubeSnapshotFromStats(stats, youtubeSnapshotAt)
        : YOUTUBE_MISSING;
    }
    try {
      await snapshotPlatformAccount(profile.id, account, prefetched);
      processed++;
    } catch (err) {
      if (isNotFoundError(err)) {
        // Expected for deleted/banned channels: count it, don't call it a
        // failure, and stop polling once the threshold is reached.
        const notFoundCount = account.notFoundCount + 1;
        await prisma.platformAccount
          .update({
            where: { id: account.id },
            data: { notFoundCount, lastNotFoundAt: new Date() },
          })
          .catch(() => {});
        log.warn(
          {
            creatorProfileId: profile.id,
            platform: account.platform,
            platformUserId: account.platformUserId,
            notFoundCount,
            stopped: notFoundCount >= NOT_FOUND_SKIP_THRESHOLD,
          },
          "Platform account not found",
        );
        continue;
      }
      errors++;
      log.error(
        {
          err,
          creatorProfileId: profile.id,
          platform: account.platform,
          platformUserId: account.platformUserId,
        },
        "Failed to snapshot platform account",
      );
    }
  }
  // Fully resumed profile: its aggregates were updated by the first attempt.
  if (polled === 0 && profile.platformAccounts.length > 0) {
    return { processed, errors, resumed };
  }

  // Update aggregate totals and evaluate tier changes
  try {
    await recomputeCreatorAggregates(profile.id);
    await recomputeCreatorGrowthRollups(
      profile.id,
      profile.platformAccounts.map((account) => account.platform),
    );
  } catch (err) {
    log.error(
      { err, creatorProfileId: profile.id },
      "Failed to update profile aggregates",
    );
  }

  // Never fails the run (see createRunCacheInvalidator).
  try {
    const slug = await getCreatorSlug(profile.id);
    if (slug) await cache.creator(slug);
  } catch (err) {
    log.warn(
      { err, creatorProfileId: profile.id },
      "Cache invalidation failed — continuing",
    );
  }

  return { processed, errors, resumed };
}

export async function snapshotPlatformAccount(
  creatorProfileId: string,
  account: {
    id: string;
    platform: Platform;
    platformUserId: string;
    isOAuthConnected: boolean;
    accessToken: string | null;
  },
  /** Already fetched by a batch lookup (tier jobs, YouTube). */
  prefetched?: PrefetchedSnapshot,
): Promise<void> {
  if (!supportsCreatorSnapshots(account.platform, account.isOAuthConnected)) {
    return;
  }

  let snapshotData: CreatorSnapshotData;
  if (prefetched === YOUTUBE_MISSING) {
    throw new AdapterError(
      "youtube",
      "not_found",
      `YouTube channel ID '${account.platformUserId}' not found`,
    );
  } else if (prefetched) {
    snapshotData = prefetched;
  } else {
    const adapter = getAdapter(account.platform);
    if (!adapter) {
      // Platform adapter not yet implemented — skip silently
      return;
    }

    const fetchOptions: { isOAuthConnected: boolean; accessToken?: string } = {
      isOAuthConnected: account.isOAuthConnected,
    };
    if (account.accessToken) {
      fetchOptions.accessToken = await decryptToken(account.accessToken);
    }

    snapshotData = await adapter.fetchSnapshot(
      account.platformUserId,
      fetchOptions,
    );
  }

  // Strip internal transport fields (prefixed with _) before persisting metrics
  const persistableMetrics = Object.fromEntries(
    Object.entries(snapshotData.extendedMetrics).filter(
      ([key]) => !key.startsWith("_"),
    ),
  );

  await prisma.metricSnapshot.create({
    data: {
      creatorProfileId,
      platform: account.platform,
      snapshotAt: snapshotData.snapshotAt,
      followerCount: snapshotData.followerCount,
      followingCount: snapshotData.followingCount,
      totalViews: snapshotData.totalViews,
      subscriberCount: snapshotData.subscriberCount,
      postCount: snapshotData.postCount,
      extendedMetrics: toJsonValue(persistableMetrics),
    },
  });

  // Update cached fields on PlatformAccount. The channel answered, so any
  // earlier not-found streak is over (a renamed/unbanned channel returning,
  // or an OAuth reconnect) — clear it and keep the account in the rotation.
  await prisma.platformAccount.update({
    where: { id: account.id },
    data: {
      followerCount: snapshotData.followerCount,
      followingCount: snapshotData.followingCount,
      totalViews: snapshotData.totalViews,
      subscriberCount: snapshotData.subscriberCount,
      postCount: snapshotData.postCount,
      lastSyncedAt: snapshotData.snapshotAt,
      notFoundCount: 0,
      lastNotFoundAt: null,
    },
  });

  // Refresh CreatorProfile metadata from Twitch API data so that social-link
  // discovery (manual `creators/discover-links` runs) sees newly added links,
  // and so that displayName stays in sync with Twitch (handles renames).
  // The Twitch adapter stashes these in extendedMetrics to avoid extra API calls.
  if (account.platform === "twitch") {
    const ext = snapshotData.extendedMetrics as Record<string, unknown>;
    const freshBio = typeof ext._bio === "string" ? ext._bio : null;
    const freshAvatar =
      typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;
    const freshDisplayName =
      typeof ext._displayName === "string" ? ext._displayName : null;
    const freshLogin = typeof ext._login === "string" ? ext._login : null;

    if (
      freshBio !== null ||
      freshAvatar !== null ||
      freshDisplayName !== null
    ) {
      const profileUpdate: Record<string, string> = {};
      if (freshBio !== null) profileUpdate.bio = freshBio;
      if (freshAvatar !== null) profileUpdate.avatarUrl = freshAvatar;
      if (freshDisplayName !== null)
        profileUpdate.displayName = freshDisplayName;

      await prisma.creatorProfile.update({
        where: { id: creatorProfileId },
        data: profileUpdate,
      });
    }

    // Keep PlatformAccount.platformUsername in sync with the Twitch login
    if (freshLogin !== null) {
      await prisma.platformAccount.update({
        where: { id: account.id },
        data: { platformUsername: freshLogin },
      });
    }

    // Refresh top clips (throttled internally to once per 20h per creator)
    try {
      await refreshCreatorClips(creatorProfileId, account.platformUserId);
    } catch (err) {
      log.warn(
        { err, creatorProfileId, platformUserId: account.platformUserId },
        "Clip sync failed — continuing",
      );
    }
  }

  if (account.platform === "tiktok") {
    const ext = snapshotData.extendedMetrics as Record<string, unknown>;
    const freshBio = typeof ext._bio === "string" ? ext._bio : null;
    const freshAvatar =
      typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;
    const freshDisplayName =
      typeof ext._displayName === "string" ? ext._displayName : null;
    const freshUsername =
      typeof ext._username === "string" ? ext._username : null;
    const freshProfileUrl =
      typeof ext._profileUrl === "string" ? ext._profileUrl : null;

    if (
      freshBio !== null ||
      freshAvatar !== null ||
      freshDisplayName !== null
    ) {
      const profileUpdate: Record<string, string> = {};
      if (freshBio !== null) profileUpdate.bio = freshBio;
      if (freshAvatar !== null) profileUpdate.avatarUrl = freshAvatar;
      if (freshDisplayName !== null)
        profileUpdate.displayName = freshDisplayName;

      await prisma.creatorProfile.update({
        where: { id: creatorProfileId },
        data: profileUpdate,
      });
    }

    if (
      freshUsername !== null ||
      freshProfileUrl !== null ||
      freshAvatar !== null ||
      freshDisplayName !== null
    ) {
      await prisma.platformAccount.update({
        where: { id: account.id },
        data: {
          ...(freshUsername ? { platformUsername: freshUsername } : {}),
          ...(freshProfileUrl ? { platformUrl: freshProfileUrl } : {}),
          ...(freshAvatar ? { platformAvatarUrl: freshAvatar } : {}),
          ...(freshDisplayName
            ? { platformDisplayName: freshDisplayName }
            : {}),
        },
      });
    }
  }

  if (account.platform === "x") {
    const ext = snapshotData.extendedMetrics as Record<string, unknown>;
    const resolvedId =
      typeof ext._resolvedUserId === "string" ? ext._resolvedUserId : null;
    const freshUsername =
      typeof ext._username === "string" ? ext._username : null;
    const freshDisplayName =
      typeof ext._displayName === "string" ? ext._displayName : null;
    const freshAvatar =
      typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;

    const accountUpdate: Record<string, string> = {};

    // Discovery keys X rows by @handle; heal to the immutable numeric ID so
    // renames can't orphan the row. (platform, platformUserId) is unique and
    // a link-only sh-social row may already hold the same numeric ID, so
    // only heal when the slot is free.
    if (resolvedId !== null && resolvedId !== account.platformUserId) {
      const conflict = await prisma.platformAccount.findUnique({
        where: {
          platform_platformUserId: {
            platform: "x",
            platformUserId: resolvedId,
          },
        },
        select: { id: true },
      });
      if (!conflict) {
        accountUpdate.platformUserId = resolvedId;
      } else {
        log.warn(
          {
            creatorProfileId,
            accountId: account.id,
            resolvedId,
            conflictAccountId: conflict.id,
          },
          "X numeric ID already keyed by another account — keeping handle key",
        );
      }
    }

    if (freshUsername !== null) {
      accountUpdate.platformUsername = freshUsername;
      accountUpdate.platformUrl = `https://x.com/${freshUsername}`;
    }
    if (freshDisplayName !== null) {
      accountUpdate.platformDisplayName = freshDisplayName;
    }
    if (freshAvatar !== null) {
      accountUpdate.platformAvatarUrl = freshAvatar;
    }

    if (Object.keys(accountUpdate).length > 0) {
      await prisma.platformAccount.update({
        where: { id: account.id },
        data: accountUpdate,
      });
    }
  }
}

async function getCreatorSlug(
  creatorProfileId: string,
): Promise<string | null> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { slug: true },
  });
  return profile?.slug ?? null;
}
