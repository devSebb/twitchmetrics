import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), flush: vi.fn() }));

import { TIER_SNAPSHOT_JOB_TYPE } from "@/server/services/ingestion/job-types";
import {
  WATCHED_GITHUB_JOBS,
  jobProblems,
  type WatchedJob,
  type WatchedRun,
} from "./github-jobs-watchdog";

const NOW = new Date("2026-11-07T14:00:00Z");
const tier1: WatchedJob = {
  jobType: "tier1-snapshot",
  platform: null,
  maxAgeHours: 14,
  maxRunHours: 2,
};

function run(
  hoursAgo: number,
  status = "completed",
  shard: string | null = null,
): WatchedRun {
  return {
    status,
    startedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
    shard,
  };
}

describe("jobProblems", () => {
  it("fresh: a recent completed run is OK", () => {
    expect(jobProblems(tier1, [run(3)], NOW)).toEqual([]);
  });

  it("late: the newest completed run is older than the limit", () => {
    expect(jobProblems(tier1, [run(30)], NOW)).toEqual([
      "last completed run started 30 h ago (limit 14 h)",
    ]);
  });

  it("missing: no row at all, or no completed row ever", () => {
    expect(jobProblems(tier1, [], NOW)).toEqual(["no completed run on record"]);
    expect(jobProblems(tier1, [run(2, "failed")], NOW)).toEqual([
      "no completed run on record",
    ]);
  });

  it("failed or degraded but recent: the latest run didn't complete", () => {
    expect(jobProblems(tier1, [run(8), run(2, "failed")], NOW)).toEqual([
      "latest run failed, started 2 h ago",
    ]);
    expect(jobProblems(tier1, [run(8), run(2, "degraded")], NOW)).toEqual([
      "latest run degraded, started 2 h ago",
    ]);
  });

  it("a failure followed by a completed run has healed", () => {
    expect(jobProblems(tier1, [run(8, "failed"), run(2)], NOW)).toEqual([]);
  });

  it("a run in progress counts as fresh while younger than maxRunHours", () => {
    expect(jobProblems(tier1, [run(20), run(1, "running")], NOW)).toEqual([]);
  });

  it('a run still "running" past maxRunHours is dead: late by age', () => {
    expect(jobProblems(tier1, [run(20), run(3, "running")], NOW)).toEqual([
      "last completed run started 20 h ago (limit 14 h)",
    ]);
  });

  it("tier1 at 13 h is on time, at 15 h is late", () => {
    expect(jobProblems(tier1, [run(13)], NOW)).toEqual([]);
    expect(jobProblems(tier1, [run(15)], NOW)).toEqual([
      "last completed run started 15 h ago (limit 14 h)",
    ]);
  });

  it("checks each shard: one failed shard is reported", () => {
    const tier3 = { ...tier1, jobType: "tier3-snapshot", maxAgeHours: 40 };
    expect(
      jobProblems(
        tier3,
        [run(10, "failed", "0/2"), run(7, "completed", "1/2")],
        NOW,
      ),
    ).toEqual(["latest run (shard 0/2) failed, started 10 h ago"]);
  });
});

describe("the 2026-11-06 GitHub billing lock (SH daily, 14:00 check)", () => {
  const shDaily = WATCHED_GITHUB_JOBS.find(
    (job) =>
      job.jobType === "streamhatchet-daily-sessions" &&
      job.platform === "twitch",
  )!;
  const check = new Date("2026-11-06T14:00:00Z");
  const at = (iso: string, status = "completed"): WatchedRun => ({
    status,
    startedAt: new Date(iso),
    shard: null,
  });

  it("a missed day is late at the same day's check", () => {
    expect(jobProblems(shDaily, [at("2026-11-05T07:52:00Z")], check)).toEqual([
      "last completed run started 30 h ago (limit 28 h)",
    ]);
  });

  it("a healthy day, done or still running, is OK", () => {
    expect(
      jobProblems(
        shDaily,
        [at("2026-11-05T07:52:00Z"), at("2026-11-06T07:52:00Z")],
        check,
      ),
    ).toEqual([]);
    expect(
      jobProblems(
        shDaily,
        [at("2026-11-05T07:52:00Z"), at("2026-11-06T10:30:00Z", "running")],
        check,
      ),
    ).toEqual([]);
  });
});

describe("WATCHED_GITHUB_JOBS", () => {
  it("covers every tier and every SH daily platform", () => {
    const labels = WATCHED_GITHUB_JOBS.map(
      (job) => `${job.jobType}:${job.platform ?? ""}`,
    );
    for (const jobType of Object.values(TIER_SNAPSHOT_JOB_TYPE)) {
      expect(labels).toContain(`${jobType}:`);
    }
    expect(labels).toEqual(
      expect.arrayContaining([
        "streamhatchet-daily-sessions:kick",
        "streamhatchet-daily-sessions:yt",
        "streamhatchet-daily-sessions:twitch",
      ]),
    );
  });
});
