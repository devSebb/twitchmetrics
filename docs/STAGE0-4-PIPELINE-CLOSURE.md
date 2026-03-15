# Stage 0–4 Fixes — Pipeline Closure & Roadmap Integrity

> **Scope:** Stage 1 pipeline verification (snapshot worker + growth rollup + vertical slice test), Stage 0 manual tasks, roadmap metadata sync, SLO documentation
> **Priority:** Critical — must complete before Stage 5 work
> **Tasks:** S0, S1.1–S1.3, A.1–A.3, B.1–B.4

---

## Architecture Context

### Full data pipeline (end-to-end)

```
Platform API → PlatformAdapter → Snapshot Worker → MetricSnapshot (DB)
                                                         ↓
                                       Growth Rollup Worker
                                                         ↓
                                       CreatorGrowthRollup (DB)
                                                         ↓
                                       tRPC Router → Dashboard UI
```

**Current state:** Stages 1-4 are functionally complete. Inngest-based snapshot functions exist and work. But the standalone pipeline (workers/ directory) needs verification, and roadmap metadata in `src/App.jsx` is out of sync.

### Key existing files

| Component                 | Location                                                  | Notes                                     |
| ------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| Twitch adapter            | `src/server/adapters/twitch.ts`                           | ~480 lines, stable, with retry + backoff  |
| YouTube adapter           | `src/server/adapters/youtube.ts`                          | ~200 lines, beta, quota-aware             |
| Inngest snapshot shared   | `src/inngest/functions/snapshots/shared.ts`               | `runTierSnapshot()` — processes all tiers |
| Inngest tier functions    | `src/inngest/functions/snapshots/tier{1,2,3}-snapshot.ts` | Cron-triggered                            |
| YouTube standalone worker | `workers/snapshot-youtube.ts`                             | CLI-based, batch processing               |
| API: creator profile      | `src/app/api/creators/[slug]/route.ts`                    | REST endpoint                             |
| API: creator snapshots    | `src/app/api/creators/[slug]/snapshots/route.ts`          | Time-series with platform filter          |
| Platform constants        | `src/lib/constants/platforms.ts`                          | `PLATFORM_CONFIG` with 6 platforms        |
| Tier constants            | `src/lib/constants/tiers.ts`                              | `TIER_CONFIG` with thresholds and cadence |
| Roadmap definitions       | `src/App.jsx`                                             | Stage objects with tasks, status, notes   |

### Worker conventions (from `workers/snapshot-youtube.ts`)

```typescript
// CLI args: --dry-run, --limit N, --tier tier1|tier2|tier3
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// Direct PrismaClient (NOT @/ alias)
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Lightweight logging (not pino)
function log(
  level: "info" | "warn" | "error",
  msg: string,
  data?: Record<string, unknown>,
) {
  const ts = new Date().toISOString();
  console[level](
    `[${ts}] [worker-name] ${msg}${data ? ` ${JSON.stringify(data)}` : ""}`,
  );
}

// Batch processing: 50 per batch, 5s pause
const BATCH_SIZE = 50;

// Clean exit
await prisma.$disconnect();
```

---

## S0 — Register ALL 5 Platform Developer Apps (MANUAL)

### This is a manual task — no code generation needed

Register developer apps on all platforms. Don't block on approval — submit and continue.

| #   | Platform       | Portal                   | Redirect URI                                        | Notes                              |
| --- | -------------- | ------------------------ | --------------------------------------------------- | ---------------------------------- |
| 1   | Twitch         | dev.twitch.tv            | `http://localhost:3000/api/auth/callback/twitch`    | Note Client ID + Secret            |
| 2   | YouTube/Google | console.cloud.google.com | `http://localhost:3000/api/auth/callback/google`    | Enable YouTube Data API v3 + OAuth |
| 3   | Instagram      | developers.facebook.com  | `http://localhost:3000/api/auth/callback/instagram` | Requires Facebook Page link        |
| 4   | TikTok         | developers.tiktok.com    | (per TikTok docs)                                   | Submit for review (1–4 weeks)      |
| 5   | X              | developer.x.com          | `http://localhost:3000/api/auth/callback/twitter`   | Basic tier ($100/mo)               |

Save all Client IDs and Secrets in `.env.local`. See `docs/PLATFORM_REGISTRATION.md` for detailed instructions.

---

## S1.1 — Twitch Snapshot Worker (Standalone)

### Goal

Create a standalone Twitch snapshot worker (parallel to Inngest functions) for manual/cron-triggered execution.

### File to create

`workers/snapshot-twitch.ts`

### Implementation instructions

Model after `workers/snapshot-youtube.ts` exactly. Key differences:

1. **Platform:** Query `PlatformAccount` where `platform = "twitch"`
2. **API calls:** Use Twitch Helix API directly (inline, like youtube worker does):

   ```typescript
   // App token for public data
   const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID!;
   const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET!;

   async function getTwitchAppToken(): Promise<string> {
     const res = await fetch("https://id.twitch.tv/oauth2/token", {
       method: "POST",
       headers: { "Content-Type": "application/x-www-form-urlencoded" },
       body: `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
     });
     const json = await res.json();
     return json.access_token;
   }
   ```

3. **Snapshot data:** Fetch from Twitch Helix:
   - `GET /users?id={userId}` → `view_count`
   - `GET /channels/followers?broadcaster_id={userId}` → `total` (follower count)
   - `GET /streams?user_id={userId}` → live status, viewer count

4. **Rate limiting:** Twitch allows 800 req/min with app token. Add a simple counter:

   ```typescript
   let requestCount = 0;
   const RATE_LIMIT = 750; // Stay under 800
   const RATE_WINDOW_MS = 60_000;
   ```

5. **CLI interface:**

   ```
   tsx workers/snapshot-twitch.ts                    # Full run
   tsx workers/snapshot-twitch.ts --dry-run           # Count only
   tsx workers/snapshot-twitch.ts --limit 50          # Max 50 accounts
   tsx workers/snapshot-twitch.ts --tier tier1        # Only tier1
   ```

6. **Write to DB:**
   ```typescript
   await prisma.metricSnapshot.create({
     data: {
       creatorProfileId,
       platform: "twitch",
       snapshotAt: new Date(),
       followerCount: BigInt(followers),
       totalViews: BigInt(viewCount),
       extendedMetrics: { isLive, viewerCount, gameName },
     },
   });
   ```

### Add to `package.json`

```json
"worker:snapshot-twitch": "tsx workers/snapshot-twitch.ts"
```

---

## S1.2 — Growth Rollup Worker

### Goal

Create standalone growth rollup worker that computes deltas from MetricSnapshot data.

### File to create

`workers/growth-rollup.ts`

**See `docs/STAGE5-04-GROWTH-ENGINE.md` Task 5.4.1 for full implementation details.** This is the same worker — implement it once, it serves both S1.2 and 5.4.1.

### Core logic summary

1. For each CreatorProfile with snapshots:
2. Get latest snapshot + snapshots from 1d, 7d, 30d ago (closest available)
3. Compute deltas and percentages
4. Determine `trendDirection` (UP if 7d > 0.5%, DOWN if < -0.5%, FLAT otherwise)
5. Compute `acceleration` (current 7d rate vs previous 7d rate)
6. Upsert into `CreatorGrowthRollup`

### Add to `package.json`

```json
"worker:growth-rollup": "tsx workers/growth-rollup.ts"
```

---

## S1.3 — Vertical Slice Test

### Goal

Prove the full pipeline works end-to-end: Adapter → Snapshot → Rollup → API.

### File to create

`workers/test-vertical-slice.ts`

### Implementation

```typescript
// workers/test-vertical-slice.ts
// Usage: tsx workers/test-vertical-slice.ts [--slug ninja]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = (() => {
  const i = process.argv.indexOf("--slug");
  return i !== -1 ? process.argv[i + 1] : "ninja"; // Default test creator
})();

async function main() {
  console.log("=== VERTICAL SLICE TEST ===\n");

  // Step 1: Verify creator exists
  console.log(`Step 1: Looking up creator "${SLUG}"...`);
  const creator = await prisma.creatorProfile.findUnique({
    where: { slug: SLUG },
    include: { platformAccounts: true },
  });
  if (!creator) {
    console.error(`❌ Creator "${SLUG}" not found. Run seed first.`);
    process.exit(1);
  }
  console.log(
    `✅ Found: ${creator.displayName} (${creator.platformAccounts.length} platform accounts)\n`,
  );

  // Step 2: Check for snapshots
  console.log("Step 2: Checking snapshots...");
  const snapshotCount = await prisma.metricSnapshot.count({
    where: { creatorProfileId: creator.id },
  });
  console.log(
    `${snapshotCount > 0 ? "✅" : "⚠️"} ${snapshotCount} snapshots found\n`,
  );

  // Step 3: Check growth rollup
  console.log("Step 3: Checking growth rollup...");
  const rollup = await prisma.creatorGrowthRollup.findFirst({
    where: { creatorProfileId: creator.id },
  });
  if (rollup) {
    console.log(`✅ Growth rollup exists:`);
    console.log(`   followerDelta7d: ${rollup.followerDelta7d}`);
    console.log(`   trendDirection: ${rollup.trendDirection}`);
  } else {
    console.log("⚠️ No growth rollup found (run growth-rollup worker first)");
  }
  console.log();

  // Step 4: Test API endpoints
  console.log("Step 4: Testing API endpoints...");
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  try {
    const profileRes = await fetch(`${baseUrl}/api/creators/${SLUG}`);
    console.log(
      `  GET /api/creators/${SLUG} → ${profileRes.status} ${profileRes.status === 200 ? "✅" : "❌"}`,
    );

    const snapshotRes = await fetch(
      `${baseUrl}/api/creators/${SLUG}/snapshots?period=7d`,
    );
    console.log(
      `  GET /api/creators/${SLUG}/snapshots?period=7d → ${snapshotRes.status} ${snapshotRes.status === 200 ? "✅" : "❌"}`,
    );
  } catch (err) {
    console.log(`  ⚠️ API not reachable (is the dev server running?): ${err}`);
  }

  console.log("\n=== TEST COMPLETE ===");
  await prisma.$disconnect();
}

main().catch(console.error);
```

### Success criteria

All 4 steps return valid data:

1. Creator exists in DB with platform accounts
2. MetricSnapshots exist (at least 1)
3. CreatorGrowthRollup exists with computed deltas
4. API endpoints return 200 with data

### Run sequence

```bash
# 1. Take a snapshot for one creator
tsx workers/snapshot-twitch.ts --limit 1

# 2. Compute growth rollup
tsx workers/growth-rollup.ts --limit 1

# 3. Run vertical slice test (requires dev server running)
pnpm dev &  # Start dev server in background
tsx workers/test-vertical-slice.ts --slug ninja
```

---

## A.1 — Update Stage 4 Header Metadata in App.jsx

### Goal

Set Stage 4 status to "done" and update statusNote to reflect actual completion.

### File to modify

`src/App.jsx`

### Instructions

Find the Stage 4 object (look for `id: 4` or `title: "Stage 4"`). Update:

1. Set `status` to `"done"`
2. Rewrite `statusNote` to: `"Stage 4 complete. All 19 tasks done: dashboard layout, widget catalog (P0+P1+P2), YouTube adapter + worker, multi-platform snapshots, media kit, manager dashboard, creator settings."`
3. Add a `changeNote` if the field exists: `"Reconciled status with task flags: all 19 tasks marked done; status was outdated; synced."`

### DO NOT

- Do not change any task `done` flags — only update stage-level metadata
- Do not modify other stages

---

## A.2 — Sync Stage-4 Doc with App.jsx

### Goal

Update the stage-4 markdown doc to reflect 19/19 completion.

### File to modify

Look for `.md/stage-4-dashboard-widgets-multi-platform.md` or similar in the `.md/` directory. If it doesn't exist, skip this task.

### Instructions

Find the "Progress Snapshot" section. Update:

- Completed: 19
- Pending: 0
- Completion: 100%

---

## A.3 — Add Changelog Entry for Status Divergence

### Goal

Document the reconciliation of Stage 4 status drift.

### File to create or modify

`CHANGELOG.md` (at project root)

### Content to add

```markdown
## [Unreleased]

### Fixed

- Reconciled Stage 4 status in App.jsx: all 19 tasks were marked done but stage status was still "upcoming" with outdated statusNote. Set status to "done" and synced documentation. (Audit-driven consistency fix, 2026-03-14)
```

---

## B.1 — Verify Twitch Snapshot Worker Behavior

### Goal

Review the standalone Twitch snapshot worker (created in S1.1) for correctness.

### Verification checklist

- [ ] Tiering is applied (reads `snapshotTier` from CreatorProfile, processes tier1 first)
- [ ] Rate limits enforced (stays under 800 req/min for Twitch)
- [ ] Retry with exponential backoff on 429/5xx responses
- [ ] Structured logging: counts for processed, skipped, failed
- [ ] Clean exit with `prisma.$disconnect()`
- [ ] `--dry-run` mode works without writing to DB

---

## B.2 — Verify Growth Rollup Worker

### Goal

Review the growth rollup worker (created in S1.2/5.4.1) for correctness.

### Verification checklist

- [ ] Runs after snapshot workers (in sequence, not parallel)
- [ ] Correctly reads MetricSnapshot and computes 1d/7d/30d deltas
- [ ] Handles missing snapshots (uses closest available within tolerance)
- [ ] Upserts CreatorGrowthRollup without duplicates (uses `@@unique([creatorProfileId, platform])`)
- [ ] Logging: creators processed, errors
- [ ] `--dry-run` mode works

---

## B.3 — Document Vertical Slice Test Results

### Goal

Execute the vertical slice test and document pass/fail results.

### File to create

`docs/vertical-slice-test-results.md`

### Template

```markdown
# Vertical Slice Test Results

**Date:** YYYY-MM-DD
**Environment:** Local development

## Steps

| #   | Step                                         | Expected                             | Actual | Status |
| --- | -------------------------------------------- | ------------------------------------ | ------ | ------ |
| 1   | Creator exists in DB                         | CreatorProfile with PlatformAccounts |        | ☐      |
| 2   | Snapshots exist                              | ≥1 MetricSnapshot rows               |        | ☐      |
| 3   | Growth rollup computed                       | CreatorGrowthRollup with deltas      |        | ☐      |
| 4a  | GET /api/creators/[slug]                     | 200 with profile data                |        | ☐      |
| 4b  | GET /api/creators/[slug]/snapshots?period=7d | 200 with time-series                 |        | ☐      |

## Result

**Overall:** PASS / FAIL

## Notes

(Any issues encountered and how they were resolved)
```

---

## B.4 — Define Operational Freshness SLO

### Goal

Document target data freshness for each tier.

### File to create

`docs/SLO.md`

### Content

```markdown
# Operational SLOs — Data Freshness

## Snapshot Freshness

| Tier                     | Target Freshness | Measurement                     |
| ------------------------ | ---------------- | ------------------------------- |
| Tier 1 (100K+ followers) | ≤ 6 hours        | max(lastSnapshotAt) per creator |
| Tier 2 (10K+ followers)  | ≤ 24 hours       | max(lastSnapshotAt) per creator |
| Tier 3 (all others)      | ≤ 7 days         | max(lastSnapshotAt) per creator |
| Claimed creators         | ≤ 6 hours        | Always promoted to Tier 1       |

## Growth Rollup Freshness

| Metric                   | Target                            | Measurement                       |
| ------------------------ | --------------------------------- | --------------------------------- |
| Rollup computation delay | ≤ 30 minutes after snapshot batch | max(computedAt) - max(snapshotAt) |

## Platform-Specific Limits

| Platform  | API Rate Limit   | Daily Quota      | Effective Max Creators        |
| --------- | ---------------- | ---------------- | ----------------------------- |
| Twitch    | 800 req/min      | Unlimited        | ~50K/day (with batching)      |
| YouTube   | N/A              | 10,000 units/day | ~3,000/day (3 units/snapshot) |
| Instagram | 200/hr per token | N/A              | Per-creator only              |
| TikTok    | 100/min          | TBD              | TBD (pending approval)        |
| X         | 300/15min        | N/A              | ~28K/day                      |

## Alerting Thresholds

- **Warning:** Any Tier 1 creator with lastSnapshotAt > 12 hours ago
- **Critical:** Any Tier 1 creator with lastSnapshotAt > 24 hours ago
- **Warning:** Growth rollup not computed within 1 hour of snapshot batch
```

---

## Execution order

1. **A.1 → A.2 → A.3** — Roadmap metadata sync (quick, no code)
2. **S1.1** — Create Twitch snapshot worker
3. **S1.2** — Create growth rollup worker (shared with 5.4.1)
4. **B.1 → B.2** — Verify both workers
5. **S1.3 → B.3** — Run vertical slice test and document results
6. **B.4** — Write SLO doc
7. **S0** — Register platform apps (ongoing manual task)

---

## Validation checklist

- [ ] `src/App.jsx` Stage 4 status is "done" with accurate statusNote
- [ ] `tsx workers/snapshot-twitch.ts --dry-run` runs without errors
- [ ] `tsx workers/growth-rollup.ts --dry-run` runs without errors
- [ ] `tsx workers/test-vertical-slice.ts` passes all 4 steps
- [ ] `docs/vertical-slice-test-results.md` exists with pass/fail documented
- [ ] `docs/SLO.md` exists with freshness targets
- [ ] `CHANGELOG.md` has reconciliation entry
- [ ] `pnpm build` succeeds
