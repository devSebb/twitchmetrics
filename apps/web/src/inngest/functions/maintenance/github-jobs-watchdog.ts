import * as Sentry from "@sentry/nextjs";
import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { EMAIL_FROM, sendEmail } from "@/server/services/email";
import {
  SH_DAILY_SESSIONS_JOB_TYPE,
  SH_DAILY_SESSIONS_PLATFORMS,
  TIER_SNAPSHOT_JOB_TYPE,
} from "@/server/services/ingestion/job-types";

const log = createLogger("github-jobs-watchdog");

/**
 * Watchdog for the jobs that run on GitHub Actions, run from Inngest so it
 * keeps working when GitHub doesn't. On 2026-11-06 a billing lock stopped
 * every GitHub job in 2 s ("The job was not started because your account is
 * locked due to a billing issue"); the health check inside
 * sh-daily-sessions.yml went down with it, and GitHub's failure email isn't
 * reliable for jobs that never start.
 *
 * It trusts only IngestionRun rows: a lock, a skipped cron, a disabled
 * workflow and a crash all show up as "no recent completed run". Read-only.
 */

export type WatchedJob = {
  jobType: string;
  /** IngestionRun.platform; null for jobs that write none. */
  platform: string | null;
  /** The newest run that completed, or is still running (see maxRunHours),
   * must have started within this many hours. */
  maxAgeHours: number;
  /** A `running` row younger than this is a run in progress and counts as
   * fresh; an older one is treated as dead. The job's longest normal run. */
  maxRunHours: number;
};

/**
 * The jobs and their limits, checked daily at 14:00 UTC. Age is measured
 * from the newest run's start, completed or in progress, so the limit is
 * the schedule interval plus how much a run's start can drift from one day
 * to the next, not plus its run time.
 *
 * Daily jobs: 28 h = 24 h + 4 h of start drift. GitHub starts these runs
 * hours late, but consistently (SH daily: 07:28-07:52 for a 01:15 cron). A
 * missed day is then late at the same day's 14:00 check, ~30 h after the
 * previous start, instead of a day later (the 2026-11-06 lock: last run
 * Nov 5 07:52, late at Nov 6 14:00). Until the cutover the tier rows come
 * from Inngest too (tier2 02:00, tier3 03:00, ~11 h old at 14:00).
 */
export const WATCHED_GITHUB_JOBS: readonly WatchedJob[] = [
  // Every 6 h; 6 h + up to 7 h of GitHub start delay + 1 h margin. Runs:
  // Inngest up to 55 min, GitHub 120 min timeout.
  {
    jobType: TIER_SNAPSHOT_JOB_TYPE.tier1,
    platform: null,
    maxAgeHours: 14,
    maxRunHours: 2,
  },
  // Daily. Runs: Inngest ~140 min, GitHub 240 min timeout.
  {
    jobType: TIER_SNAPSHOT_JOB_TYPE.tier2,
    platform: null,
    maxAgeHours: 28,
    maxRunHours: 4,
  },
  // Daily. Runs: Inngest ~315 min; GitHub 220 min timeout per shard.
  {
    jobType: TIER_SNAPSHOT_JOB_TYPE.tier3,
    platform: null,
    maxAgeHours: 28,
    maxRunHours: 6,
  },
  // Daily, one row per platform. Runs: 300 min workflow timeout.
  ...SH_DAILY_SESSIONS_PLATFORMS.map((platform) => ({
    jobType: SH_DAILY_SESSIONS_JOB_TYPE,
    platform,
    maxAgeHours: 28,
    maxRunHours: 5,
  })),
];

/** The only finished status that counts as OK. `degraded` (e.g. a tier run
 * cut short by its time budget) and `failed` are problems. `running` is a
 * run in progress while younger than the job's maxRunHours, else dead (it
 * is finalized as failed after 24 h). */
const OK_STATUS = "completed";
const RUNNING_STATUS = "running";

export type WatchedRun = {
  status: string;
  startedAt: Date;
  /** metadata.shard ("0/2") for sharded runs, else null. */
  shard: string | null;
};

const HOUR_MS = 3_600_000;

function hoursAgo(now: Date, at: Date): number {
  return Math.round((now.getTime() - at.getTime()) / HOUR_MS);
}

function newest(runs: readonly WatchedRun[]): WatchedRun | null {
  return runs.reduce<WatchedRun | null>(
    (best, run) => (!best || run.startedAt > best.startedAt ? run : best),
    null,
  );
}

/**
 * What's wrong with one job, from its runs: the newest completed one (any
 * age) plus every run started within the limit. Empty = OK.
 *
 * Problems: no completed or in-progress run on record; the newest of those
 * started longer ago than the limit; or, within the limit, the newest
 * finished run of a shard (or of the job, unsharded) did not complete. A
 * failure followed by a completed run of the same shard has healed and is
 * not reported.
 */
export function jobProblems(
  job: WatchedJob,
  runs: readonly WatchedRun[],
  now: Date,
): string[] {
  const age = (run: WatchedRun) => now.getTime() - run.startedAt.getTime();
  const lastOk = newest(runs.filter((run) => run.status === OK_STATUS));
  const inProgress = newest(
    runs.filter(
      (run) =>
        run.status === RUNNING_STATUS && age(run) <= job.maxRunHours * HOUR_MS,
    ),
  );
  const freshest = newest([lastOk, inProgress].filter((run) => run !== null));
  if (!freshest) return ["no completed run on record"];

  const problems: string[] = [];
  if (age(freshest) > job.maxAgeHours * HOUR_MS) {
    problems.push(
      `last completed run started ${hoursAgo(now, freshest.startedAt)} h ago (limit ${job.maxAgeHours} h)`,
    );
  }

  const newestPerShard = new Map<string | null, WatchedRun>();
  for (const run of runs) {
    if (run.status === RUNNING_STATUS) continue;
    if (age(run) > job.maxAgeHours * HOUR_MS) continue;
    const best = newestPerShard.get(run.shard);
    if (!best || run.startedAt > best.startedAt) {
      newestPerShard.set(run.shard, run);
    }
  }
  for (const [shard, run] of newestPerShard) {
    if (run.status !== OK_STATUS) {
      problems.push(
        `latest run${shard ? ` (shard ${shard})` : ""} ${run.status}, started ${hoursAgo(now, run.startedAt)} h ago`,
      );
    }
  }
  return problems;
}

function jobLabel(job: WatchedJob): string {
  return job.platform ? `${job.jobType} (${job.platform})` : job.jobType;
}

function shardOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "shard" in metadata) {
    const shard = (metadata as { shard: unknown }).shard;
    return typeof shard === "string" ? shard : null;
  }
  return null;
}

async function loadRuns(job: WatchedJob, now: Date): Promise<WatchedRun[]> {
  const where = { jobType: job.jobType, platform: job.platform };
  const select = { status: true, startedAt: true, metadata: true } as const;
  const [lastOk, recent] = await Promise.all([
    prisma.ingestionRun.findFirst({
      where: { ...where, status: OK_STATUS },
      orderBy: { startedAt: "desc" },
      select,
    }),
    prisma.ingestionRun.findMany({
      where: {
        ...where,
        startedAt: { gte: new Date(now.getTime() - job.maxAgeHours * HOUR_MS) },
      },
      select,
    }),
  ]);
  return [...(lastOk ? [lastOk] : []), ...recent].map((run) => ({
    status: run.status,
    startedAt: run.startedAt,
    shard: shardOf(run.metadata),
  }));
}

/** One line per late job; empty when every job is OK. */
async function findLateJobs(now: Date): Promise<string[]> {
  const late: string[] = [];
  for (const job of WATCHED_GITHUB_JOBS) {
    const problems = jobProblems(job, await loadRuns(job, now), now);
    if (problems.length > 0) {
      late.push(`${jobLabel(job)}: ${problems.join("; ")}`);
    }
  }
  return late;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!,
  );
}

const ACTIONS_URL = "https://github.com/devSebb/twitchmetrics/actions";

/** Log, report to Sentry and send one email for all late jobs. Never throws,
 * so a failed send isn't retried into repeat emails. */
async function alert(late: string[]): Promise<"sent" | "skipped" | "failed"> {
  const subject = `[TwitchMetrics] ${late.length} GitHub job${late.length === 1 ? "" : "s"} late or failing`;
  log.error({ late }, subject);
  Sentry.captureMessage(`${subject}: ${late.join(" | ")}`, "error");
  // Serverless: send it before the invocation ends, or it can be lost.
  await Sentry.flush(2000).catch(() => false);

  const to = process.env.OPS_ALERT_EMAIL?.trim();
  if (!to) {
    log.warn("OPS_ALERT_EMAIL is not set — alert email skipped");
    return "skipped";
  }
  const hint =
    "Check GitHub Actions: an account or billing lock, a disabled workflow, or failed runs. " +
    `${ACTIONS_URL}\nRollback for tier snapshots: re-add the Inngest tier crons (PLAN-infra step 3).`;
  try {
    await sendEmail({
      to,
      from: EMAIL_FROM.notifications,
      subject,
      text: `${late.map((line) => `- ${line}`).join("\n")}\n\n${hint}`,
      html:
        `<ul>${late.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` +
        `<p>${escapeHtml(hint).replace("\n", "<br>")}</p>`,
    });
    return "sent";
  } catch (err) {
    log.error({ err }, "Alert email failed");
    return "failed";
  }
}

// Daily at 14:00 UTC: after the morning's late GitHub starts have landed
// (SH daily sessions start ~08:00) and after finalize-stale-runs (06:40).
// One email a day at most; the event is for a manual check.
export const githubJobsWatchdog = inngest.createFunction(
  { id: "github-jobs-watchdog", concurrency: { limit: 1 } },
  [{ cron: "0 14 * * *" }, { event: "maintenance/github-jobs-watchdog" }],
  async ({ step }) => {
    const late = await step.run("check-github-jobs", () =>
      findLateJobs(new Date()),
    );
    if (late.length === 0) {
      log.info({ jobs: WATCHED_GITHUB_JOBS.length }, "All GitHub jobs on time");
      return { late, alert: "none" as const };
    }
    const sent = await step.run("alert", () => alert(late));
    return { late, alert: sent };
  },
);
