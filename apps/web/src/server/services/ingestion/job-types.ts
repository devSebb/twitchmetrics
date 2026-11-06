/**
 * IngestionRun.jobType names of the jobs that run (or will run) on GitHub
 * Actions. The run writers (the GitHub workers and the Inngest wrappers) and
 * the github-jobs-watchdog that checks them all take the name from here, so a
 * renamed job can't silently drop out of the check.
 *
 * No imports: root workers run with plain `npx tsx` and import this file by
 * relative path.
 */

export const TIER_SNAPSHOT_JOB_TYPE = {
  tier1: "tier1-snapshot",
  tier2: "tier2-snapshot",
  tier3: "tier3-snapshot",
} as const;

export const SH_DAILY_SESSIONS_JOB_TYPE = "streamhatchet-daily-sessions";

/**
 * Platforms `sh-daily-sessions.yml` imports, one IngestionRun row each
 * (IngestionRun.platform). Keep in step with the workflow's import steps.
 */
export const SH_DAILY_SESSIONS_PLATFORMS = ["kick", "yt", "twitch"] as const;
