/**
 * One-off backfill: bring CreatorProfile.totalFollowers in line with the
 * 2026-11 rule in packages/core/src/creator-aggregates.ts — the total adds up
 * every account the creator header shows, social links included (ibai showed
 * 37.7M next to five platforms adding up to 99.7M). The snapshot tier still
 * counts tracked accounts only, so polling load does not change.
 *
 * Only profiles whose stored total differs from the sum of their accounts are
 * touched, through the shared recompute (so tier, views and lastSnapshotAt
 * follow the same rule as every other writer).
 *
 * Dry run by default: prints how many profiles would change, how many would
 * change tier (expected ~0), and a few well-known examples.
 *
 * Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/recompute-creator-totals.ts
 *   npx tsx --env-file=apps/web/.env.local workers/recompute-creator-totals.ts --write
 */
import { prisma } from "@twitchmetrics/database";
import { recomputeCreatorAggregatesMany } from "@twitchmetrics/core/creator-aggregates";
import { TIER_CONFIG } from "@twitchmetrics/core/tiers";

const WRITE = process.argv.includes("--write");
const CHUNK = 1_000;
const EXAMPLE_TWITCH_LOGINS = ["ibai", "xqc", "ishowspeed", "kaicenat"];

function log(msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [recompute-creator-totals] ${msg}`;
  console.log(
    data === undefined
      ? line
      : `${line} ${JSON.stringify(data, (_k, v: unknown) =>
          typeof v === "bigint" ? v.toString() : v,
        )}`,
  );
}

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /closed the connection|Connection terminated|ECONNRESET|timed out|Can't reach database|connection pool|P1001|P1017|P2024/i.test(
    msg,
  );
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= attempts) throw err;
      const wait = Math.min(30_000, 1_000 * 2 ** attempt);
      log(`retryable DB error, retry ${attempt} in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

type Drift = {
  id: string;
  stored: bigint;
  expected: bigint;
  tier_now: string;
  tier_expected: string;
};

async function main() {
  log(`start mode=${WRITE ? "WRITE" : "dry-run"}`);

  // Same sums as buildRecomputeAggregatesSql, compared with what is stored.
  const drift = await prisma.$queryRaw<Drift[]>`
    SELECT cp.id,
           cp."totalFollowers" AS stored,
           COALESCE(a.total, 0)::bigint AS expected,
           cp."snapshotTier"::text AS tier_now,
           CASE
             WHEN COALESCE(a.tracked, 0) >= ${TIER_CONFIG.tier1.followerThreshold} THEN 'tier1'
             WHEN COALESCE(a.tracked, 0) >= ${TIER_CONFIG.tier2.followerThreshold} THEN 'tier2'
             ELSE 'tier3'
           END AS tier_expected
    FROM "CreatorProfile" cp
    LEFT JOIN (
      SELECT "creatorProfileId",
             SUM("followerCount") AS total,
             SUM("followerCount") FILTER (WHERE "discoverySource" IS NULL) AS tracked
      FROM "PlatformAccount"
      GROUP BY 1
    ) a ON a."creatorProfileId" = cp.id
    WHERE cp."totalFollowers" IS DISTINCT FROM COALESCE(a.total, 0)
  `;

  const tierChanges = drift.filter((d) => d.tier_now !== d.tier_expected);
  const raised = drift.filter((d) => d.expected > d.stored).length;
  log("profiles whose total would change", {
    total: drift.length,
    raised,
    lowered: drift.length - raised,
    tierChanges: tierChanges.length,
  });

  const examples = await prisma.$queryRaw<
    { login: string; id: string; stored: bigint }[]
  >`
    SELECT pa."platformUsername" AS login, cp.id, cp."totalFollowers" AS stored
    FROM "PlatformAccount" pa
    JOIN "CreatorProfile" cp ON cp.id = pa."creatorProfileId"
    WHERE pa.platform = 'twitch'
      AND lower(pa."platformUsername") = ANY(${EXAMPLE_TWITCH_LOGINS})
  `;
  const byId = new Map(drift.map((d) => [d.id, d]));
  for (const e of examples) {
    const d = byId.get(e.id);
    log(`example ${e.login}`, {
      stored: e.stored,
      expected: d ? d.expected : e.stored,
    });
  }

  if (!WRITE) {
    log("dry run — nothing written. Re-run with --write to apply.");
    return;
  }

  const ids = drift.map((d) => d.id);
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    updated += await withRetry(() => recomputeCreatorAggregatesMany(batch));
    if ((i / CHUNK) % 25 === 0 || i + CHUNK >= ids.length) {
      log("progress", {
        done: Math.min(i + CHUNK, ids.length),
        of: ids.length,
        updated,
      });
    }
  }
  log("done", { updated });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
