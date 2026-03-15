# Stage 5 — Part 1: Tier Scheduler, Pipeline & Job Queue

> **Scope:** Tier-aware snapshot scheduling, auto-promote claimed creators, BullMQ job queue
> **Priority:** P0–P1 · **Estimated effort:** ~8h
> **Depends on:** Stage 1 pipeline (Inngest snapshot functions + shared helper exist)

---

## Architecture Context

### What exists today

| Component                 | Location                                      | Status                                                         |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Inngest snapshot crons    | `src/inngest/functions/snapshots/`            | 3 tier functions (tier1/tier2/tier3) + game snapshot           |
| Shared snapshot helper    | `src/inngest/functions/snapshots/shared.ts`   | Working — dispatches to twitch + youtube adapters              |
| Tier constants            | `src/lib/constants/tiers.ts`                  | `TIER_CONFIG` with thresholds, crons, promotion/demotion logic |
| Platform adapters         | `src/server/adapters/twitch.ts`, `youtube.ts` | Working (Twitch stable, YouTube beta)                          |
| Adapter types             | `src/server/adapters/types.ts`                | `PlatformAdapter` interface, `AdapterError` class              |
| Rate limiters             | `src/lib/redis.ts`                            | Per-platform Upstash sliding-window limiters                   |
| YouTube standalone worker | `workers/snapshot-youtube.ts`                 | Standalone tsx script with CLI flags                           |

### Architecture rules (from `docs/ARCHITECTURE.md`)

1. **Adapter-only integration** — All platform API calls go through `PlatformAdapter`. No direct API calls.
2. **Worker responsibility separation** — Snapshot workers write snapshots only. Rollup workers write rollups only.
3. **Tier rules from constants** — Cadence and thresholds come from `TIER_CONFIG` in `src/lib/constants/tiers.ts`.
4. **Background jobs via Inngest** — The app uses Inngest for cron-based jobs. Standalone workers in `workers/` are for manual/migration tasks.
5. **Path alias** — `@/` maps to `apps/web/src/`. Workers at `workers/` cannot use `@/` imports (they use inline code or direct `@prisma/client` imports).

### Data flow

```
TIER_CONFIG (tiers.ts) → Inngest cron → shared.ts runTierSnapshot()
  → getAdapterForPlatform(platform) → adapter.fetchSnapshot()
  → prisma.metricSnapshot.create() + prisma.platformAccount.update()
  → updateProfileAggregates() → re-evaluates tier with getTierForCreator()
```

### Key types

```typescript
// From tiers.ts
type TierConfig = {
  tier: SnapshotTier; // "tier1" | "tier2" | "tier3"
  followerThreshold: number; // 100_000, 10_000, 0
  cronExpression: string; // "0 */6 * * *", "0 2 * * *", "0 3 * * 0"
  intervalHours: number; // 6, 24, 168
  promotionThreshold: number;
  demotionThreshold: number;
  demotionGracePeriod: number;
};

// From types.ts
interface PlatformAdapter {
  readonly platform: Platform;
  fetchProfile(platformUsername: string): Promise<CreatorProfileData>;
  fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
}
```

### Database models involved

- **CreatorProfile** — `snapshotTier`, `lastSnapshotAt`, `totalFollowers`, `state` fields
- **PlatformAccount** — `platform`, `platformUserId`, `lastSyncedAt`, `isOAuthConnected`, `accessToken`
- **MetricSnapshot** — append-only time series, indexed by `[creatorProfileId, platform, snapshotAt]`

---

## Task 5.1.1 (P0) — Tier-Aware Snapshot Scheduler

### Goal

Create a standalone scheduler worker that reads `TIER_CONFIG`, queries creators grouped by tier, checks if each is due for a new snapshot based on `lastSyncedAt`, and dispatches to the appropriate platform adapter.

### File to create

`workers/snapshot-scheduler.ts`

### Implementation instructions

1. **CLI interface** — Match existing worker convention (see `workers/snapshot-youtube.ts`):
   - `--dry-run` — log what would run, don't execute
   - `--tier {tier1|tier2|tier3}` — filter to one tier
   - Parse args from `process.argv.slice(2)`

2. **Query creators by tier** — Use `@prisma/client` directly (workers can't use `@/` alias):

   ```typescript
   const profiles = await prisma.creatorProfile.findMany({
     where: {
       snapshotTier: tierFilter ?? undefined,
       // Only creators that have at least one platform account
       platformAccounts: { some: {} },
     },
     select: {
       id: true,
       slug: true,
       snapshotTier: true,
       lastSnapshotAt: true,
       platformAccounts: {
         select: {
           id: true,
           platform: true,
           platformUserId: true,
           isOAuthConnected: true,
           accessToken: true,
         },
       },
     },
   });
   ```

3. **Check if due for snapshot** — Compare `lastSnapshotAt` against tier interval:

   ```typescript
   function isDueForSnapshot(profile: {
     snapshotTier: string;
     lastSnapshotAt: Date | null;
   }): boolean {
     if (!profile.lastSnapshotAt) return true; // Never snapshotted
     const intervalMs = TIER_INTERVALS[profile.snapshotTier]; // Map tier → ms from TIER_CONFIG values
     return Date.now() - profile.lastSnapshotAt.getTime() >= intervalMs;
   }
   ```

4. **Tier intervals** — Hard-code from `TIER_CONFIG` (workers can't import from `@/`):
   - tier1: 6 hours (21_600_000 ms)
   - tier2: 24 hours (86_400_000 ms)
   - tier3: 168 hours (604_800_000 ms)

5. **Dispatch** — For each due profile, call platform API inline (like `snapshot-youtube.ts` does). Process tier1 first, then tier2, then tier3.

6. **Batch processing** — 50 profiles per batch, 5s pause between batches (matching `shared.ts` pattern).

7. **Logging** — Use the lightweight logging pattern from `snapshot-youtube.ts`:

   ```typescript
   function log(
     level: "info" | "warn" | "error",
     msg: string,
     data?: Record<string, unknown>,
   ) {
     const ts = new Date().toISOString();
     const extra = data ? ` ${JSON.stringify(data)}` : "";
     console[level](`[${ts}] [snapshot-scheduler] ${msg}${extra}`);
   }
   ```

8. **Result summary** — Log final counts: `✓ {processed} snapshots, {skipped} not due, {errors} failed`

### Scheduling

The scheduler itself is invoked by external cron (e.g., crontab, EventBridge, or a single Inngest cron that calls the scheduler). Example cron rules:

- `*/15 * * * *` — Run scheduler every 15 min (it decides internally which tiers are due)

### DO NOT

- Do not import from `@/` — workers are standalone tsx scripts
- Do not modify `shared.ts` or Inngest functions — this is a parallel standalone mechanism
- Do not write rollup data — snapshot workers only write snapshots (Architecture rule #10)

---

## Task 5.1.2 (P0) — Auto-Promote Claimed Creators to Tier 1

### Goal

When a claim is approved, automatically promote the creator to Tier 1 for higher-frequency snapshots. Add a daily demotion job for inactive claimed creators.

### Files to modify

1. **`src/server/services/claiming.ts`** — Add tier promotion after claim approval
2. **`src/inngest/functions/snapshots/shared.ts`** — (read-only reference, do not modify)
3. **New file: `src/inngest/functions/snapshots/demote-inactive.ts`** — Daily demotion check

### Implementation instructions

**Part A — Promote on claim approval:**

In `src/server/services/claiming.ts`, the `approveClaimRequest()` function already:

- Updates ClaimRequest status to `approved`
- Calls `transitionProfileState()` to set state to `claimed`
- Sends Inngest enrichment event

**Add after the state transition** (before the Inngest event send):

```typescript
// Auto-promote claimed creator to Tier 1 for higher snapshot frequency
await prisma.creatorProfile.update({
  where: { id: claim.creatorProfileId },
  data: { snapshotTier: "tier1" },
});
```

**Part B — Daily demotion job:**

Create `src/inngest/functions/snapshots/demote-inactive.ts`:

```typescript
// Inngest function: daily check for inactive Tier 1 creators
// Demotes claimed creators with no isLive=true snapshot in 30 days back to Tier 2
```

Follow the existing Inngest function pattern:

```typescript
import { inngest } from "@/inngest/client";

export const demoteInactiveCreators = inngest.createFunction(
  { id: "demote-inactive-creators", name: "Demote Inactive Creators" },
  { cron: "0 4 * * *" }, // Daily at 4am UTC (after snapshot jobs)
  async ({ step }) => { ... }
);
```

Logic:

1. Query Tier 1 creators where state = `claimed`
2. For each, check if any MetricSnapshot in last 30 days has `extendedMetrics` containing `isLive: true`
3. If no live activity in 30 days: update `snapshotTier` to `tier2`
4. Log results: `{demoted} creators demoted from tier1 to tier2`

**Register the new function** in `src/inngest/functions/` index or wherever Inngest functions are collected (check `src/app/api/inngest/route.ts` for the functions array).

### DO NOT

- Do not change tier thresholds in `tiers.ts` — claimed creators bypass normal threshold logic
- Do not demote to tier3 — only tier1 → tier2 demotion for inactive claimed creators
- Do not modify the `evaluatePromotion`/`evaluateDemotion` functions — those handle follower-based tiering

---

## Task 5.1.3 (P1) — BullMQ Job Queue for Reliable Worker Execution

### Goal

Set up BullMQ (Redis-backed) for reliable, retryable job processing. This replaces ad-hoc standalone workers with queue-based execution.

### Files to create

1. **`src/server/queue/index.ts`** — Queue setup + job type definitions
2. **`src/server/queue/workers.ts`** — Worker processors

### Implementation instructions

1. **Install BullMQ:**

   ```bash
   cd apps/web && pnpm add bullmq
   ```

2. **Queue setup** (`src/server/queue/index.ts`):

   ```typescript
   import { Queue } from "bullmq";

   // Reuse Upstash Redis connection config (but BullMQ needs ioredis-compatible connection)
   // NOTE: BullMQ requires a standard Redis connection, NOT Upstash HTTP REST.
   // You'll need REDIS_URL env var pointing to a standard Redis instance.
   const connection = { url: process.env.REDIS_URL };

   export const snapshotQueue = new Queue("snapshots", { connection });
   export const growthQueue = new Queue("growth-rollups", { connection });
   export const searchQueue = new Queue("search-reindex", { connection });
   ```

3. **Job types:**

   ```typescript
   export type SnapshotJob = {
     type: "SNAPSHOT_TWITCH" | "SNAPSHOT_YOUTUBE";
     creatorProfileId: string;
     platformAccountId: string;
     platformUserId: string;
     tier: SnapshotTier;
   };

   export type GrowthRollupJob = {
     type: "GROWTH_ROLLUP";
     creatorProfileId: string;
   };

   export type SearchReindexJob = {
     type: "SEARCH_REINDEX";
     scope: "creators" | "games" | "all";
   };
   ```

4. **Retry configuration:**
   - 3 attempts with exponential backoff
   - Dead letter queue for persistent failures
   - Concurrency: 5 per worker

5. **Integration point** — The scheduler (5.1.1) pushes jobs to the queue instead of processing directly.

### Important notes

- BullMQ requires a **standard Redis** connection (TCP), not Upstash HTTP REST
- If only Upstash is available, consider using Inngest events as the queue mechanism instead (already in use for snapshot crons)
- This task is P1 — Inngest already handles the core scheduling. BullMQ adds reliability for standalone workers.

### DO NOT

- Do not replace Inngest cron functions — BullMQ complements, not replaces
- Do not add BullMQ as a hard dependency for existing flows — it should be opt-in for standalone workers
- Do not store secrets or tokens in job payloads — pass IDs and look up from DB

---

## Validation checklist

After implementing each task, verify:

- [ ] **5.1.1**: Run `tsx workers/snapshot-scheduler.ts --dry-run` — should log tier groups and which creators are due
- [ ] **5.1.1**: Run `tsx workers/snapshot-scheduler.ts --tier tier3 --limit 5` — should process 5 tier3 creators
- [ ] **5.1.2**: Approve a test claim → verify creator's `snapshotTier` is now `tier1`
- [ ] **5.1.2**: Inngest dev server shows `demote-inactive-creators` function registered
- [ ] **5.1.3**: `pnpm build` succeeds with BullMQ dependency
- [ ] All existing Inngest snapshot functions still work (no regressions)
- [ ] No `@/` imports in `workers/` directory files
