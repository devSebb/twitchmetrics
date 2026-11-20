/**
 * Starts the GitHub Actions data jobs on time.
 *
 * GitHub's own `schedule` trigger starts this repo's workflows 6-8 hours late
 * (the 01:15 UTC daily import started 07:47-09:09 every day of 2026-11), which
 * a 30-minute job can't live with. A `workflow_dispatch` starts within
 * seconds, so Vercel Cron (apps/web/vercel.json) calls
 * /api/cron/dispatch/<slot> on time and this sends the dispatch.
 *
 * The slot table is the one place that says what runs when: vercel.json has
 * one cron per slot (github-dispatch.test.ts keeps the two in step) and the
 * workflows have no `schedule` of their own.
 */

export const GITHUB_REPO = "devSebb/twitchmetrics";

export type DispatchSlot = {
  /** Vercel cron expression (UTC), repeated in vercel.json. */
  cron: string;
  workflow: "scheduled-jobs.yml" | "creator-snapshots.yml";
  inputs: Record<string, string>;
};

/** Job ids are workers/run-job.ts CRON_FUNCTION_IDS; a slot's jobs run one
 * after the other, in this order. */
export const DISPATCH_SLOTS = {
  // Twitch live game stats; each snapshot is stamped with its 30-min slot.
  game: {
    cron: "*/30 * * * *",
    workflow: "scheduled-jobs.yml",
    inputs: { jobs: "game-snapshot" },
  },
  hourly: {
    cron: "20 * * * *",
    workflow: "scheduled-jobs.yml",
    inputs: {
      jobs: "kick-category-snapshot streamhatchet-live-games-snapshot streamhatchet-live-channels-snapshot",
    },
  },
  "kick-channels": {
    cron: "15 */3 * * *",
    workflow: "scheduled-jobs.yml",
    inputs: { jobs: "kick-channel-snapshot" },
  },
  discovery: {
    cron: "35 */6 * * *",
    workflow: "scheduled-jobs.yml",
    inputs: {
      jobs: "kick-category-discovery streamhatchet-game-discovery-snapshot",
    },
  },
  daily: {
    cron: "0 4 * * *",
    workflow: "scheduled-jobs.yml",
    inputs: {
      jobs: "enrich-creators demote-inactive-creators discover-games enrich-games discover-creators enrich-claimed-profiles finalize-stale-ingestion-runs",
    },
  },
  tier1: {
    cron: "0 */6 * * *",
    workflow: "creator-snapshots.yml",
    inputs: { tier: "tier1" },
  },
  tier2: {
    cron: "0 2 * * *",
    workflow: "creator-snapshots.yml",
    inputs: { tier: "tier2" },
  },
  tier3: {
    cron: "0 3 * * *",
    workflow: "creator-snapshots.yml",
    inputs: { tier: "tier3" },
  },
} as const satisfies Record<string, DispatchSlot>;

export type DispatchSlotName = keyof typeof DISPATCH_SLOTS;

export function isDispatchSlot(value: string): value is DispatchSlotName {
  return Object.hasOwn(DISPATCH_SLOTS, value);
}

export type DispatchResult =
  | { ok: true; slot: DispatchSlotName; workflow: string }
  | { ok: false; slot: DispatchSlotName; status: number; error: string };

/**
 * Send one workflow_dispatch. `token` is a fine-grained GitHub token with
 * "Actions: read and write" on the repo (env GITHUB_DISPATCH_TOKEN). GitHub
 * answers 204 with no body when the run was queued.
 */
export async function dispatchSlot(
  slot: DispatchSlotName,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DispatchResult> {
  const { workflow, inputs } = DISPATCH_SLOTS[slot];
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "twitchmetrics-cron",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main", inputs }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (error) {
    return { ok: false, slot, status: 0, error: (error as Error).message };
  }
  if (response.status === 204) return { ok: true, slot, workflow };
  const body = await response.text().catch(() => "");
  return {
    ok: false,
    slot,
    status: response.status,
    error: body.slice(0, 300),
  };
}
