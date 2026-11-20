/**
 * Run an Inngest job's body on a GitHub runner (PLAN-infra A.2).
 *
 * The job code is the same function the Inngest wrapper calls; only the step
 * tools differ: here `step.run` just runs the callback (no memoization, no
 * 300 s cap) and `step.sleep` waits. The IngestionRun row has the same
 * jobType as the Inngest run, with metadata.runner = "github", so health
 * checks and dashboards read both runners the same way.
 *
 * Jobs:
 *   tier --tier tier1|tier2|tier3   creator snapshots (shared.ts runTierSnapshot)
 *        --shard I/N                only shard I of N (tier3 runs as 0/2, 1/2)
 *        --time-budget-min M        stop starting batches after M minutes;
 *                                   the run is then `degraded`, not failed
 *        --resume-since ISO         skip accounts snapshotted since then
 *                                   (re-run after a partial/failed run)
 *        --profile-concurrency N    profiles of a batch polled at once
 *                                   (default 1; the workflow uses 5)
 *        --write                    without it (or with --dry-run): a
 *                                   read-only count of what would be polled,
 *                                   no API calls, no writes
 *
 * Needs the app's path aliases, so run it with the app tsconfig:
 *   npx tsx --tsconfig apps/web/tsconfig.json workers/run-job.ts tier --tier tier3 --shard 0/2 --write
 *
 *   fn <id> [<id> ...]              any other cron job, by its Inngest
 *                                   function id (CRON_FUNCTION_IDS below):
 *                                   runs the function's own handler, in
 *                                   order, one after the other. A failed job
 *                                   doesn't stop the next ones; the process
 *                                   exits 1 at the end if any failed.
 *        --write                    without it: only lists what would run
 *
 * Twitch pacing: the workflow sets TWITCH_RATE_PRIORITY=tier; the tier code
 * also enters the "tier" scope itself. `fn` jobs run each step in the "job"
 * scope like on Inngest; game-snapshot enters its own scope.
 */
import { prisma, type SnapshotTier } from "@twitchmetrics/database";
import {
  loadTierProfileIds,
  runTierSnapshot,
  tierRunSummary,
  type TierSnapshotOptions,
} from "../apps/web/src/inngest/functions/snapshots/shared";
import { executeIngestionRun } from "../apps/web/src/server/services/ingestion/runs";
import { supportsCreatorSnapshots } from "../apps/web/src/server/services/ingestion/constants";
import { TIER_SNAPSHOT_JOB_TYPE } from "../apps/web/src/server/services/ingestion/job-types";
import { getTwitchRateStats } from "../apps/web/src/server/adapters/twitch-rate";
import {
  functions as inngestServedFunctions,
  githubFunctions,
} from "../apps/web/src/inngest/functions";
import { withDefaultTwitchPriority } from "../apps/web/src/inngest/middleware/twitch-priority";

const args = process.argv.slice(2);
const job = args[0];
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
// --dry-run wins over --write, so a workflow can always pass one of the two.
const WRITE = args.includes("--write") && !args.includes("--dry-run");

function log(message: string, data?: Record<string, unknown>) {
  console.log(
    `[${new Date().toISOString()}] [run-job] ${message}${data ? ` ${JSON.stringify(data)}` : ""}`,
  );
}

/** Inline step tools: no memoization, nothing to replay. */
const step = {
  run: async (_id: string, fn: () => Promise<unknown>) => fn(),
  sleep: async (_id: string, duration: string) => {
    const match = /^(\d+)\s*(ms|s|m|h)$/.exec(duration.trim());
    const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
    const ms = match
      ? Number(match[1]) * unit[match[2] as keyof typeof unit]
      : 0;
    await new Promise((resolve) => setTimeout(resolve, ms));
  },
};

function parseTier(value: string | undefined): SnapshotTier {
  if (value === "tier1" || value === "tier2" || value === "tier3") {
    return value;
  }
  throw new Error(`--tier must be tier1, tier2 or tier3 (got '${value}')`);
}

function parseShard(value: string | undefined): TierSnapshotOptions["shard"] {
  if (!value) return undefined;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || count < 1 || index >= count) {
    throw new Error(`--shard must look like 0/2 (got '${value}')`);
  }
  return { index, count };
}

async function tierJob() {
  const tier = parseTier(argValue("--tier"));
  const shard = parseShard(argValue("--shard"));
  const budgetMin = argValue("--time-budget-min");
  const resumeSince = argValue("--resume-since");
  const concurrency = argValue("--profile-concurrency");
  const options: TierSnapshotOptions = {
    ...(shard ? { shard } : {}),
    ...(budgetMin ? { timeBudgetMs: Number(budgetMin) * 60_000 } : {}),
    ...(resumeSince ? { resumeSince: new Date(resumeSince) } : {}),
    ...(concurrency ? { profileConcurrency: Number(concurrency) } : {}),
  };
  if (
    options.profileConcurrency != null &&
    !(
      Number.isInteger(options.profileConcurrency) &&
      options.profileConcurrency >= 1 &&
      options.profileConcurrency <= 20
    )
  ) {
    throw new Error(
      `--profile-concurrency must be 1-20 (got '${concurrency}')`,
    );
  }
  if (options.resumeSince && Number.isNaN(options.resumeSince.getTime())) {
    throw new Error(`--resume-since is not a date: '${resumeSince}'`);
  }

  if (!WRITE) {
    const ids = await loadTierProfileIds(tier, shard);
    const groups = await prisma.platformAccount.groupBy({
      by: ["platform", "isOAuthConnected"],
      where: {
        creatorProfileId: { in: ids },
        discoverySource: null,
        notFoundCount: { lt: 3 },
      },
      _count: { _all: true },
    });
    const polled: Record<string, number> = {};
    const notPolled: Record<string, number> = {};
    for (const g of groups) {
      const into = supportsCreatorSnapshots(g.platform, g.isOAuthConnected)
        ? polled
        : notPolled;
      into[g.platform] = (into[g.platform] ?? 0) + g._count._all;
    }
    log("dry run: would poll", {
      tier,
      shard: shard ? `${shard.index}/${shard.count}` : null,
      profiles: ids.length,
      accounts: polled,
      notPolled,
    });
    return;
  }

  log("start", { tier, ...options });
  const result = await executeIngestionRun(
    {
      domain: "creator",
      scope: "snapshot",
      jobType: TIER_SNAPSHOT_JOB_TYPE[tier],
    },
    async () => {
      const result = await runTierSnapshot(tier, step, options);
      return {
        result,
        summary: tierRunSummary(result, { runner: "github", shard }),
      };
    },
  );
  log("finished", { ...result, twitch: getTwitchRateStats() });
  if (result.stoppedByTimeBudget) {
    // Annotation on the GitHub run; the job itself stays green so the next
    // shard still runs. The IngestionRun row is `degraded`.
    console.log(
      `::warning::${tier} stopped by its time budget: ${result.profilesTotal - result.profilesReached} of ${result.profilesTotal} profiles not polled`,
    );
  }
}

/**
 * The cron jobs that run on GitHub through `fn` (scheduled-jobs.yml). Their
 * Inngest functions keep an event trigger only. Not here: the tiers (job
 * `tier`), the SH daily import (its own workflow), and what stays on
 * Inngest: refresh-tokens (needs every OAuth client secret), the
 * github-jobs-watchdog (must not depend on GitHub) and the app's events.
 */
export const CRON_FUNCTION_IDS = [
  "game-snapshot",
  "kick-category-snapshot",
  "kick-category-discovery",
  "kick-channel-snapshot",
  "streamhatchet-live-games-snapshot",
  "streamhatchet-live-channels-snapshot",
  "streamhatchet-game-discovery-snapshot",
  "enrich-creators",
  "demote-inactive-creators",
  "discover-games",
  "enrich-games",
  "discover-creators",
  "enrich-claimed-profiles",
  "finalize-stale-ingestion-runs",
] as const;

const allFunctions = [...githubFunctions, ...inngestServedFunctions];

type InlineHandler = (ctx: {
  step: typeof step;
  event: { name: string; data: Record<string, never> };
}) => Promise<unknown>;

/**
 * Run Inngest functions' handlers in this process. `fn` is the handler
 * passed to `inngest.createFunction` (private in the SDK's types, a plain
 * property at runtime); these handlers only use `step.run` / `step.sleep`
 * and write their own IngestionRun row.
 */
async function fnJob() {
  const ids = args.slice(1).filter((arg) => !arg.startsWith("--"));
  if (ids.length === 0) {
    throw new Error(`fn needs an id. Ids: ${CRON_FUNCTION_IDS.join(", ")}`);
  }
  const handlers = ids.map((id) => {
    const fn = (CRON_FUNCTION_IDS as readonly string[]).includes(id)
      ? allFunctions.find((candidate) => candidate.opts.id === id)
      : undefined;
    const handler = (fn as unknown as { fn?: InlineHandler } | undefined)?.fn;
    if (typeof handler !== "function") {
      throw new Error(
        `unknown fn '${id}'. Ids: ${CRON_FUNCTION_IDS.join(", ")}`,
      );
    }
    return { id, handler };
  });

  if (!WRITE) {
    log("dry run: would run", { ids });
    return;
  }

  const inlineStep = withDefaultTwitchPriority(step);
  const failed: string[] = [];
  for (const { id, handler } of handlers) {
    const startedAt = Date.now();
    log("start", { fn: id });
    try {
      const result = await handler({
        step: inlineStep,
        event: { name: `github/${id}`, data: {} },
      });
      log("finished", {
        fn: id,
        seconds: Math.round((Date.now() - startedAt) / 1000),
        result: result as Record<string, unknown>,
      });
    } catch (error) {
      failed.push(id);
      console.error(error);
      console.log(`::error::${id} failed: ${(error as Error).message}`);
    }
  }
  log("twitch", { twitch: getTwitchRateStats() });
  if (failed.length > 0) {
    throw new Error(`failed: ${failed.join(", ")}`);
  }
}

async function main() {
  if (job === "tier") return tierJob();
  if (job === "fn") return fnJob();
  throw new Error(`unknown job '${job ?? ""}'. Jobs: tier, fn`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
