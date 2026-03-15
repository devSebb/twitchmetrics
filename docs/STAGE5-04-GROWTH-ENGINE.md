# Stage 5 — Part 4: Growth Engine Hardening

> **Scope:** Growth rollup edge cases, trending algorithm, search reindex, stale data indicator
> **Priority:** P0 (rollups + trending) + P1 (search + UI) · **Estimated effort:** ~8h
> **Depends on:** Inngest snapshot functions, CreatorGrowthRollup model, MetricSnapshot data

---

## Architecture Context

### Growth data pipeline

```
MetricSnapshot (append-only) → Growth Rollup Worker → CreatorGrowthRollup (pre-aggregated)
CreatorGrowthRollup → tRPC snapshot.getLatestMetrics → Dashboard StatsRow / FollowerGrowthWidget
```

**Architecture rule #3:** Growth metrics MUST come from `CreatorGrowthRollup`. NEVER compute growth on-the-fly from raw snapshots in user-facing queries.

### CreatorGrowthRollup model (from Prisma schema)

```prisma
model CreatorGrowthRollup {
  id                String   @id @default(dbgenerated("gen_random_uuid()"))
  creatorProfileId  String
  platform          Platform
  computedAt        DateTime @default(now())

  followerCount     BigInt?
  followerDelta1d   BigInt?
  followerDelta7d   BigInt?
  followerDelta30d  BigInt?
  followerPct1d     Float?
  followerPct7d     Float?
  followerPct30d    Float?

  viewCount         BigInt?
  viewDelta1d       BigInt?
  viewDelta7d       BigInt?
  viewDelta30d      BigInt?

  trendDirection    String?  // "UP" | "DOWN" | "FLAT"
  acceleration      Float?   // Rate of change of growth rate

  creatorProfile    CreatorProfile @relation(fields: [creatorProfileId], references: [id])

  @@unique([creatorProfileId, platform])
  @@index([creatorProfileId])
}
```

### Existing snapshot shared helper (`shared.ts`)

The `runTierSnapshot()` function processes snapshots in batches. After snapshotting, it calls `updateProfileAggregates()` which updates `totalFollowers` and `snapshotTier`. Growth rollup computation should run **after** snapshot batches complete.

### Key types and constants

```typescript
// From metrics.ts — MetricKey union type
type MetricKey = "FOLLOWERS" | "TOTAL_VIEWS" | "AVG_VIEWERS" | "PEAK_VIEWERS" | ...

// From tiers.ts — snapshot intervals
tier1: 6h, tier2: 24h, tier3: 168h (weekly)
```

### Logging convention

```typescript
import { createLogger } from "@/lib/logger";
const log = createLogger("growth-rollup"); // or "trending", "search-reindex"
```

### Worker convention (standalone scripts in `workers/`)

- Use `@prisma/client` directly (NOT `@/` alias)
- CLI args: `--dry-run`, `--limit N`
- Lightweight inline logging (not pino — see `snapshot-youtube.ts`)
- Exit cleanly with `await prisma.$disconnect()`

---

## Task 5.4.1 (P0) — Growth Rollup Edge Cases

### Goal

Handle edge cases in growth rollup computation: new creators, missing data, outlier detection.

### Files to create/modify

- **Create:** `workers/growth-rollup.ts` — Standalone growth rollup worker
- **Reference:** `src/inngest/functions/snapshots/shared.ts` — Understand what data is available

### Implementation

```typescript
// workers/growth-rollup.ts
// Standalone script: tsx workers/growth-rollup.ts [--dry-run] [--limit N]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i !== -1 ? parseInt(args[i + 1], 10) : 0;
})();
```

### Edge case handling

**1. New creators (< 2 snapshots):**

```typescript
if (snapshots.length < 2) {
  // Set all deltas to 0, trendDirection = "FLAT"
  // Still write a rollup row so the dashboard has data to display
  rollup = {
    followerDelta1d: 0n,
    followerDelta7d: 0n,
    followerDelta30d: 0n,
    followerPct1d: 0,
    followerPct7d: 0,
    followerPct30d: 0,
    trendDirection: "FLAT",
    acceleration: 0,
  };
}
```

**2. Missing historical snapshots:**

```typescript
// If 7d-ago snapshot missing: use closest available within ±2 days
function findClosestSnapshot(
  snapshots: Snapshot[],
  targetDate: Date,
  toleranceDays: number,
): Snapshot | null {
  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
  const targetMs = targetDate.getTime();

  let closest: Snapshot | null = null;
  let closestDiff = Infinity;

  for (const s of snapshots) {
    const diff = Math.abs(s.snapshotAt.getTime() - targetMs);
    if (diff <= toleranceMs && diff < closestDiff) {
      closest = s;
      closestDiff = diff;
    }
  }
  return closest;
}

// Usage:
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const baseSnapshot = findClosestSnapshot(snapshots, sevenDaysAgo, 2); // ±2 day tolerance
```

**3. Outlier detection (>50% jump in 24h):**

```typescript
function isOutlier(current: bigint, previous: bigint): boolean {
  if (previous === 0n) return false;
  const changePct =
    Math.abs(Number(current - previous) / Number(previous)) * 100;
  return changePct > 50; // >50% change in one snapshot interval = suspicious
}

// If outlier detected:
// - Log warning with details
// - Set a flag in extendedMetrics or a separate table for admin review
// - Use the previous-previous snapshot for trend calculation instead
// - Do NOT include the outlier point in trend calculation
```

**4. Stale data detection:**

```typescript
// If no snapshots in 48h for a tier1/tier2 creator:
const latestSnapshot = snapshots[0];
const hoursSinceLastSnapshot =
  (Date.now() - latestSnapshot.snapshotAt.getTime()) / (60 * 60 * 1000);

if (hoursSinceLastSnapshot > 48) {
  log("warn", "Stale data detected", {
    creatorProfileId,
    hoursSinceLastSnapshot: Math.round(hoursSinceLastSnapshot),
  });
  // Write rollup with staleData flag (store in acceleration or add a note)
}
```

### Rollup computation logic

```typescript
async function computeRollup(creatorProfileId: string, platform: string) {
  const now = new Date();
  const snapshots = await prisma.metricSnapshot.findMany({
    where: { creatorProfileId, platform },
    orderBy: { snapshotAt: "desc" },
    take: 200, // Enough for 30d lookback
  });

  if (snapshots.length === 0) return null;

  const latest = snapshots[0];
  const oneDayAgo = findClosestSnapshot(snapshots, new Date(now.getTime() - 1 * 24 * 3600_000), 1);
  const sevenDaysAgo = findClosestSnapshot(snapshots, new Date(now.getTime() - 7 * 24 * 3600_000), 2);
  const thirtyDaysAgo = findClosestSnapshot(snapshots, new Date(now.getTime() - 30 * 24 * 3600_000), 3);

  const followerDelta1d = oneDayAgo ? (latest.followerCount ?? 0n) - (oneDayAgo.followerCount ?? 0n) : 0n;
  const followerDelta7d = sevenDaysAgo ? (latest.followerCount ?? 0n) - (sevenDaysAgo.followerCount ?? 0n) : 0n;
  const followerDelta30d = thirtyDaysAgo ? (latest.followerCount ?? 0n) - (thirtyDaysAgo.followerCount ?? 0n) : 0n;

  // Percentage calculations
  const followerPct7d = sevenDaysAgo && sevenDaysAgo.followerCount
    ? Number(followerDelta7d) / Number(sevenDaysAgo.followerCount) * 100
    : 0;

  // Trend direction
  const trendDirection = followerPct7d > 0.5 ? "UP" : followerPct7d < -0.5 ? "DOWN" : "FLAT";

  // Acceleration: compare current 7d rate vs previous 7d rate
  // ... (compare 7d growth % to the 7d growth % computed 7 days ago)

  return {
    followerCount: latest.followerCount,
    followerDelta1d, followerDelta7d, followerDelta30d,
    followerPct1d: /* ... */, followerPct7d, followerPct30d: /* ... */,
    viewCount: latest.totalViews,
    viewDelta1d: /* ... */, viewDelta7d: /* ... */, viewDelta30d: /* ... */,
    trendDirection,
    acceleration: /* ... */,
  };
}
```

### Upsert into DB

```typescript
await prisma.creatorGrowthRollup.upsert({
  where: { creatorProfileId_platform: { creatorProfileId, platform } },
  update: { ...rollupData, computedAt: new Date() },
  create: { creatorProfileId, platform, ...rollupData },
});
```

### DO NOT

- Do not compute growth in API routes — always read from `CreatorGrowthRollup`
- Do not include outlier data points in trend calculations without flagging
- Do not delete outlier snapshots — flag them for admin review

---

## Task 5.4.2 (P0) — Trending Algorithm for Landing Page

### Goal

Create a trending service that scores creators by growth velocity for the landing page "Trending Creators" section.

### File to create

`src/server/services/trending.ts`

### Implementation

```typescript
import { prisma } from "@/server/db";
import { cacheGet, cacheSet, CACHE_TTL } from "./cache";
import { createLogger } from "@/lib/logger";
import { serializeBigInt } from "@/app/api/_lib/serialize";

const log = createLogger("trending");

const CACHE_KEY = "trending:landing";

type TrendingCreator = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  totalFollowers: string; // Serialized BigInt
  trendScore: number;
  followerPct7d: number;
  trendDirection: string;
  primaryPlatform: string;
};

/**
 * Trending score formula:
 * score = (followerPct7d * 0.6) + (viewPct7d * 0.3) + (streamFrequency * 0.1)
 *
 * Where streamFrequency = streams in last 7 days / 7 (normalized 0-1)
 */
export async function getTrendingCreators(
  limit = 20,
): Promise<TrendingCreator[]> {
  // Check cache first
  const cached = await cacheGet<TrendingCreator[]>(CACHE_KEY);
  if (cached) return cached;

  // Query rollups with positive growth
  const rollups = await prisma.creatorGrowthRollup.findMany({
    where: {
      followerPct7d: { gt: 0 },
    },
    include: {
      creatorProfile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          avatarUrl: true,
          totalFollowers: true,
          platformAccounts: {
            select: { platform: true },
            take: 1,
            orderBy: { followerCount: "desc" },
          },
        },
      },
    },
    orderBy: { followerPct7d: "desc" },
    take: limit * 2, // Fetch more to account for filtering
  });

  const trending: TrendingCreator[] = rollups
    .map((r) => {
      const viewPct7d =
        r.viewDelta7d && r.viewCount
          ? (Number(r.viewDelta7d) / Math.max(Number(r.viewCount), 1)) * 100
          : 0;

      const trendScore = (r.followerPct7d ?? 0) * 0.6 + viewPct7d * 0.3;

      return {
        id: r.creatorProfile.id,
        slug: r.creatorProfile.slug,
        displayName: r.creatorProfile.displayName,
        avatarUrl: r.creatorProfile.avatarUrl,
        totalFollowers: r.creatorProfile.totalFollowers.toString(),
        trendScore,
        followerPct7d: r.followerPct7d ?? 0,
        trendDirection: r.trendDirection ?? "FLAT",
        primaryPlatform:
          r.creatorProfile.platformAccounts[0]?.platform ?? "twitch",
      };
    })
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, limit);

  // Cache for 10 minutes
  await cacheSet(CACHE_KEY, trending, CACHE_TTL.TRENDING_LANDING);

  return trending;
}
```

### Integration point

The landing page's trending section should call `getTrendingCreators()` in its Server Component data fetch, replacing any existing direct DB query.

### DO NOT

- Do not compute trending in the client — this is a server-side service
- Do not query raw MetricSnapshot for trending — use CreatorGrowthRollup
- Do not show creators with negative growth in trending

---

## Task 5.4.3 (P1) — Search Reindex Worker

### Goal

Daily worker that rebuilds `searchText` columns on `CreatorProfile` and `Game` to keep search accurate as usernames change.

### File to create

`workers/search-reindex.ts`

### Implementation

Follow the existing worker pattern from `workers/backfill-search-data.ts` (242 lines). The reindex worker is a simplified version that runs daily.

```typescript
// workers/search-reindex.ts
// Usage: tsx workers/search-reindex.ts [--dry-run] [--scope creators|games|all]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_SIZE = 100;

async function reindexCreators() {
  const creators = await prisma.creatorProfile.findMany({
    select: {
      id: true,
      displayName: true,
      slug: true,
      platformAccounts: {
        select: { platformUsername: true, platformDisplayName: true },
      },
    },
  });

  let updated = 0;
  for (const creator of creators) {
    // Build searchText from all sources
    const parts = [
      creator.displayName,
      creator.slug,
      ...creator.platformAccounts
        .map((a) => a.platformUsername)
        .filter(Boolean),
      ...creator.platformAccounts
        .map((a) => a.platformDisplayName)
        .filter(Boolean),
    ];
    const searchText = [...new Set(parts)].join(" ").toLowerCase();

    await prisma.creatorProfile.update({
      where: { id: creator.id },
      data: { searchText },
    });
    updated++;
  }

  return updated;
}

async function reindexGames() {
  const games = await prisma.game.findMany({
    select: { id: true, name: true, slug: true, aliases: true },
  });

  let updated = 0;
  for (const game of games) {
    const parts = [game.name, game.slug];
    // Add aliases if the field exists
    const searchText = parts.filter(Boolean).join(" ").toLowerCase();

    await prisma.game.update({
      where: { id: game.id },
      data: { searchText },
    });
    updated++;
  }

  return updated;
}
```

### Scheduling

Add to `package.json` scripts:

```json
"worker:search-reindex": "tsx workers/search-reindex.ts"
```

Or schedule via Inngest daily cron (after snapshot workers):

```typescript
// src/inngest/functions/search-reindex.ts
export const searchReindex = inngest.createFunction(
  { id: "search-reindex" },
  { cron: "0 5 * * *" }, // Daily at 5am UTC
  async ({ step }) => { ... }
);
```

### DO NOT

- Do not use `@/` imports — this is a standalone worker
- Do not truncate existing searchText — always rebuild from source data
- Do not run during peak hours — schedule for early morning UTC

---

## Task 5.4.4 (P1) — "Last Synced" Stale Data Indicator

### Goal

Show users when data was last refreshed on creator profiles and dashboard.

### File to create

`src/components/shared/SyncStatus.tsx`

### Implementation

```typescript
"use client";

import { formatDistanceToNow } from "date-fns"; // or implement manually

type SyncStatusProps = {
  lastSyncedAt: string | Date | null; // ISO string or Date
};

export function SyncStatus({ lastSyncedAt }: SyncStatusProps) {
  if (!lastSyncedAt) {
    return (
      <span className="text-xs text-[#8B8E94]">No data yet</span>
    );
  }

  const date = typeof lastSyncedAt === "string" ? new Date(lastSyncedAt) : lastSyncedAt;
  const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);

  // Color coding
  let colorClass = "text-[#8B8E94]"; // Default gray
  let label = `Updated ${formatDistanceToNow(date, { addSuffix: true })}`;

  if (hoursAgo > 168) { // > 7 days
    colorClass = "text-red-400";
    label = `Data outdated — last updated ${formatDistanceToNow(date, { addSuffix: true })}`;
  } else if (hoursAgo > 24) {
    colorClass = "text-yellow-400";
    label = `Data may be outdated — updated ${formatDistanceToNow(date, { addSuffix: true })}`;
  }

  return (
    <span className={`text-xs ${colorClass} flex items-center gap-1`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
```

### Usage

Add to:

1. **Creator profile header** — next to the creator name
2. **Dashboard profile header** (`DashboardProfileHeader.tsx`) — below the avatar
3. **StatsRow widget** — subtle indicator below the KPI cards

### Data source

`lastSnapshotAt` from `CreatorProfile` or `lastSyncedAt` from `PlatformAccount`.

### Styling notes (from Figma V7)

- Use the project's color palette: `#8B8E94` for muted text, `#2B2D31` bg, `#313338` surface
- Keep it small — `text-xs` (12px)
- Dot indicator uses `bg-current` to match the text color

### DO NOT

- Do not use `date-fns` if it's not already in the project — check `package.json` first. If not present, use a simple inline time-ago function.
- Do not show exact timestamps — use relative time ("2 hours ago", "3 days ago")
- Do not block rendering on this component — it's a decorative indicator

---

## Validation checklist

- [ ] **5.4.1**: Run `tsx workers/growth-rollup.ts --dry-run` — logs computed rollups without writing
- [ ] **5.4.1**: New creator with 1 snapshot gets `trendDirection: "FLAT"`, all deltas `0`
- [ ] **5.4.1**: Creator with 30d of data gets correct 1d/7d/30d deltas and percentages
- [ ] **5.4.1**: Outlier detection logs warning for >50% jumps
- [ ] **5.4.2**: `getTrendingCreators()` returns sorted list by trend score
- [ ] **5.4.2**: Second call within 10 min hits cache (check logs)
- [ ] **5.4.3**: Run `tsx workers/search-reindex.ts --dry-run` — logs creators/games that would be updated
- [ ] **5.4.4**: `<SyncStatus lastSyncedAt={null} />` shows "No data yet"
- [ ] **5.4.4**: `<SyncStatus lastSyncedAt={new Date(Date.now() - 2 * 3600_000)} />` shows "Updated 2 hours ago" in gray
- [ ] **5.4.4**: `<SyncStatus lastSyncedAt={new Date(Date.now() - 48 * 3600_000)} />` shows yellow warning
- [ ] `pnpm build` succeeds
