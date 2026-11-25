/**
 * YouTube subscriber sweep: fresh counts for every listed YouTube channel,
 * straight from the YouTube Data API.
 *
 * WHY. Most YouTube subscriber counts come from Stream Hatchet's social
 * export, which rarely re-checks a channel, and the weekly refresh stamps
 * `lastSyncedAt` on every account it matches even when SH's number has not
 * moved in months. So a profile said "Updated 2d ago" over a count from
 * August: Maher Roblox showed 656K where YouTube (and Stream Hatchet BI) had
 * 954K (QA 2026-11-24). Only the ~3,400 tier-polled channels were fresh.
 *
 * WHAT. channels.list takes 50 ids per call for 1 quota unit, so ~255K
 * channels cost ~5,100 of the 10,000 daily units and take about half an hour.
 * Per account:
 *   - count changed   -> followerCount, lastSyncedAt = now, one MetricSnapshot
 *                        (SOURCE youtube_api_subscriber_sweep), creator totals
 *   - count unchanged -> lastSyncedAt = now (it WAS checked today)
 *   - count hidden    -> nothing
 *   - not returned    -> notFoundCount + 1 (dropped from the sweep at 3, the
 *                        tier jobs' rule)
 *
 * Accounts are taken least-recently-checked first and skipped when checked in
 * the last --min-age-hours, so a stopped run resumes by itself and the
 * tier-polled channels are never asked twice. Stream Hatchet's weekly refresh
 * only writes over a count that is older than its export, so it cannot
 * overwrite a swept one.
 *
 * This is the YouTube half of PLAN-infra step 6 on the columns that exist
 * today. The "verified at / tracked since" columns of step 5 are not needed
 * for a correct count; New Followers still needs them.
 *
 * Dry run by default: counts the accounts due. With --sample N it also asks
 * YouTube about the first N and prints what would change, writing nothing.
 *
 * Needs the app's path aliases (it uses the app's YouTube adapter):
 *   npx tsx --env-file=apps/web/.env.local --tsconfig apps/web/tsconfig.json \
 *     workers/youtube-subscriber-sweep.ts --sample 500
 *   npx tsx --env-file=apps/web/.env.local --tsconfig apps/web/tsconfig.json \
 *     workers/youtube-subscriber-sweep.ts --write
 *
 * Flags:
 *   --write               apply (default: dry run)
 *   --sample N            dry run only: check N accounts against the API
 *   --budget N            most accounts to check (default 300000)
 *   --max-units N         stop after N quota units (default 6000)
 *   --min-age-hours H     skip accounts checked in the last H hours (default 20)
 *   --time-budget-min M   stop starting batches after M minutes (default 50)
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { recomputeCreatorAggregatesMany } from "@twitchmetrics/core/creator-aggregates";
import {
  planSweepBatch,
  type SweepAccount,
  type SweepObservation,
} from "@twitchmetrics/core/subscriber-sweep";
import {
  YOUTUBE_CHANNELS_PER_CALL,
  fetchChannelsByIds,
} from "../apps/web/src/server/adapters/youtube";
import { AdapterError } from "../apps/web/src/server/adapters/types";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

const SNAPSHOT_SOURCE = "youtube_api_subscriber_sweep";
/** Same threshold as the tier jobs (NOT_FOUND_SKIP_THRESHOLD). */
const NOT_FOUND_SKIP_THRESHOLD = 3;
const CHANNEL_ID = /^UC[\w-]{22}$/;

function argNumber(name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number.parseInt(args[index + 1] ?? "", 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} needs a non-negative integer.`);
  }
  return value;
}

const WRITE = args.includes("--write");
const SAMPLE = argNumber("--sample", 0);
const BUDGET = argNumber("--budget", 300_000);
const MAX_UNITS = argNumber("--max-units", 6_000);
const MIN_AGE_HOURS = argNumber("--min-age-hours", 20);
const TIME_BUDGET_MIN = argNumber("--time-budget-min", 50);

function log(message: string, data?: Record<string, unknown>) {
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${new Date().toISOString()}] [yt-sweep] ${message}${extra}`);
}

function isRetryableDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Server has closed the connection|Can't reach database server|Timed out fetching a new connection|connection pool|ECONNRESET|Response from the Engine was empty/i.test(
    message,
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableDbError(error) || attempt > 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/** Listed, tracked YouTube accounts not checked lately, oldest check first. */
async function loadDueAccounts(limit: number): Promise<SweepAccount[]> {
  const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 3_600_000);
  return withRetry(() =>
    prisma.$queryRaw<SweepAccount[]>(Prisma.sql`
      SELECT a.id, a."creatorProfileId", a."platformUserId", a."followerCount"
      FROM "PlatformAccount" a
      JOIN "CreatorProfile" p ON p.id = a."creatorProfileId"
      WHERE a.platform = 'youtube'
        AND a."discoverySource" IS NULL
        AND a."notFoundCount" < ${NOT_FOUND_SKIP_THRESHOLD}
        AND p.listed
        AND p."mergedIntoId" IS NULL
        AND (a."lastSyncedAt" IS NULL OR a."lastSyncedAt" < ${cutoff})
      ORDER BY a."lastSyncedAt" ASC NULLS FIRST, a.id
      LIMIT ${limit}
    `),
  );
}

async function applyBatch(
  plan: ReturnType<typeof planSweepBatch>,
  checkedAt: Date,
): Promise<void> {
  if (plan.changed.length > 0) {
    const tuples = Prisma.join(
      plan.changed.map(
        ({ account, count }) =>
          Prisma.sql`(${account.id}::uuid, ${count}::bigint)`,
      ),
    );
    await withRetry(() =>
      prisma.$executeRaw(Prisma.sql`
        UPDATE "PlatformAccount" AS a
        SET "followerCount" = v.count,
            "lastSyncedAt" = ${checkedAt},
            "notFoundCount" = 0,
            "lastNotFoundAt" = NULL,
            "updatedAt" = now()
        FROM (VALUES ${tuples}) AS v(id, count)
        WHERE a.id = v.id
      `),
    );
    // One reading per change. A re-run the same day finds the stored count
    // already equal, so it cannot write a second one.
    await withRetry(() =>
      prisma.metricSnapshot.createMany({
        data: plan.changed.map(({ account, count }) => ({
          creatorProfileId: account.creatorProfileId,
          platform: "youtube" as const,
          snapshotAt: checkedAt,
          followerCount: count,
          subscriberCount: count,
          extendedMetrics: { SOURCE: SNAPSHOT_SOURCE },
        })),
      }),
    );
  }

  if (plan.unchanged.length > 0) {
    await withRetry(() =>
      prisma.platformAccount.updateMany({
        where: { id: { in: plan.unchanged.map((a) => a.id) } },
        data: {
          lastSyncedAt: checkedAt,
          notFoundCount: 0,
          lastNotFoundAt: null,
        },
      }),
    );
  }

  if (plan.notFound.length > 0) {
    await withRetry(() =>
      prisma.platformAccount.updateMany({
        where: { id: { in: plan.notFound.map((a) => a.id) } },
        data: { notFoundCount: { increment: 1 }, lastNotFoundAt: checkedAt },
      }),
    );
  }
}

async function main() {
  const startedAt = Date.now();
  const checking = WRITE ? BUDGET : SAMPLE;
  const accounts = await loadDueAccounts(WRITE ? BUDGET : Math.max(SAMPLE, 1));

  if (!WRITE) {
    const [{ due }] = await withRetry(() =>
      prisma.$queryRaw<[{ due: bigint }]>(Prisma.sql`
        SELECT count(*) AS due
        FROM "PlatformAccount" a
        JOIN "CreatorProfile" p ON p.id = a."creatorProfileId"
        WHERE a.platform = 'youtube'
          AND a."discoverySource" IS NULL
          AND a."notFoundCount" < ${NOT_FOUND_SKIP_THRESHOLD}
          AND p.listed
          AND p."mergedIntoId" IS NULL
          AND (a."lastSyncedAt" IS NULL
               OR a."lastSyncedAt" < ${new Date(Date.now() - MIN_AGE_HOURS * 3_600_000)})
      `),
    );
    log("Dry run", {
      accountsDue: Number(due),
      quotaUnitsNeeded: Math.ceil(Number(due) / YOUTUBE_CHANNELS_PER_CALL),
      sampling: SAMPLE,
    });
    if (SAMPLE === 0) return;
  }

  const totals = {
    checked: 0,
    changed: 0,
    unchanged: 0,
    hidden: 0,
    notFound: 0,
    invalidId: 0,
    units: 0,
  };
  const examples: Record<string, unknown>[] = [];
  const notFoundExamples: string[] = [];
  const changedProfileIds = new Set<string>();
  let stoppedBy: string | null = null;

  const valid = accounts.filter((a) => {
    if (CHANNEL_ID.test(a.platformUserId)) return true;
    totals.invalidId++;
    return false;
  });

  for (let i = 0; i < valid.length; i += YOUTUBE_CHANNELS_PER_CALL) {
    if (totals.units >= MAX_UNITS) {
      stoppedBy = "max-units";
      break;
    }
    if (Date.now() - startedAt > TIME_BUDGET_MIN * 60_000) {
      stoppedBy = "time-budget";
      break;
    }
    const batch = valid.slice(i, i + YOUTUBE_CHANNELS_PER_CALL);

    let stats: Awaited<ReturnType<typeof fetchChannelsByIds>>;
    try {
      stats = await fetchChannelsByIds(batch.map((a) => a.platformUserId));
    } catch (error) {
      // Out of quota: stop cleanly, tomorrow's run carries on from here.
      if (error instanceof AdapterError && error.code === "rate_limited") {
        stoppedBy = "quota-exceeded";
        break;
      }
      throw error;
    }
    totals.units++;

    const observed = new Map<string, SweepObservation>();
    for (const [id, channel] of stats) {
      observed.set(id, {
        subscriberCount: channel.subscriberCount,
        hidden: channel.hiddenSubscriberCount,
      });
    }
    const plan = planSweepBatch(batch, observed);

    totals.checked += batch.length;
    totals.changed += plan.changed.length;
    totals.unchanged += plan.unchanged.length;
    totals.hidden += plan.hidden.length;
    totals.notFound += plan.notFound.length;
    for (const account of plan.notFound) {
      if (notFoundExamples.length < 10) {
        notFoundExamples.push(account.platformUserId);
      }
    }
    for (const { account, count } of plan.changed) {
      changedProfileIds.add(account.creatorProfileId);
      if (examples.length < 15) {
        examples.push({
          channel: account.platformUserId,
          stored: account.followerCount?.toString() ?? null,
          youtube: count.toString(),
        });
      }
    }

    if (WRITE) await applyBatch(plan, new Date());

    if ((i / YOUTUBE_CHANNELS_PER_CALL) % 200 === 199) {
      log("Progress", { ...totals, of: valid.length });
    }
  }

  if (WRITE && changedProfileIds.size > 0) {
    await withRetry(() =>
      recomputeCreatorAggregatesMany([...changedProfileIds]),
    );
  }

  log(WRITE ? "Sweep finished" : "Sample finished (nothing written)", {
    ...totals,
    requested: checking,
    profilesRecomputed: WRITE ? changedProfileIds.size : 0,
    stoppedBy,
    minutes: Math.round((Date.now() - startedAt) / 6000) / 10,
    examples,
    notFoundExamples,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
