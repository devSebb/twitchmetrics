# Stage 5 — Part 3: Caching Layer & Performance

> **Scope:** Redis caching for public pages, cache invalidation on snapshots, Next.js ISR
> **Priority:** P0 (cache + invalidation) + P1 (ISR) · **Estimated effort:** ~6h
> **Depends on:** Upstash Redis already configured (`src/lib/redis.ts`)

---

## Architecture Context

### What exists today

| Component              | Location                                             | Status                                          |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Upstash Redis client   | `src/lib/redis.ts`                                   | Working — used for rate limiters only           |
| REST API routes        | `src/app/api/creators/`, `api/games/`, `api/search/` | Direct DB queries on every request              |
| tRPC routers           | `src/server/trpc/routers/`                           | Direct DB queries on every request              |
| Snapshot shared helper | `src/inngest/functions/snapshots/shared.ts`          | Writes MetricSnapshot + updates PlatformAccount |
| Landing page           | `src/app/(public)/page.tsx` or `src/app/page.tsx`    | Server Component, direct DB reads               |

### Redis setup (`src/lib/redis.ts`)

```typescript
import { Redis } from "@upstash/redis";
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

The Upstash Redis client uses HTTP REST (not TCP). All operations are async. Supports: `get`, `set`, `del`, `keys`, `pipeline`, and `scan`.

### Public API routes that need caching

| Route                                | Current query                                     | Suggested TTL |
| ------------------------------------ | ------------------------------------------------- | ------------- |
| `GET /api/creators`                  | `prisma.creatorProfile.findMany` + pg_trgm search | 2 min         |
| `GET /api/creators/[slug]`           | `prisma.creatorProfile.findUnique` with includes  | 5 min         |
| `GET /api/creators/[slug]/snapshots` | `prisma.metricSnapshot.findMany` with date filter | 5 min         |
| `GET /api/games`                     | `prisma.game.findMany`                            | 5 min         |
| `GET /api/games/[slug]`              | `prisma.game.findUnique`                          | 5 min         |
| `GET /api/games/[slug]/snapshots`    | `prisma.gameViewerSnapshot.findMany`              | 5 min         |
| `POST /api/search`                   | pg_trgm full-text search                          | 2 min         |

### Architecture rules

- **Server-only** — Cache service lives in `src/server/services/`, never imported from client components
- **BigInt serialization** — All DB results with BigInt must go through `serializeBigInt()` before caching (JSON doesn't support BigInt)
- **UTC everywhere** — Cache keys with timestamps use ISO 8601 UTC

---

## Task 5.3.1 (P0) — Redis Caching Layer

### Goal

Create a cache service that wraps Upstash Redis with typed get/set/invalidate operations. Integrate into public API routes for read-through caching.

### File to create

`src/server/services/cache.ts`

### Implementation

```typescript
import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("cache");

/**
 * Get a cached value. Returns null on miss or error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get<T>(key);
    if (value !== null) {
      log.debug({ key }, "Cache hit");
    }
    return value;
  } catch (err) {
    log.warn({ err, key }, "Cache get failed — falling through to DB");
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    log.warn({ err, key }, "Cache set failed — non-blocking");
  }
}

/**
 * Invalidate cache keys matching a pattern.
 * Uses SCAN (not KEYS) for production safety.
 *
 * Pattern examples:
 *   "creator:ninja" — exact key
 *   "creator:ninja:*" — all keys for this creator
 */
export async function cacheInvalidate(pattern: string): Promise<number> {
  try {
    // For exact keys (no wildcard), use del directly
    if (!pattern.includes("*")) {
      await redis.del(pattern);
      return 1;
    }

    // For patterns, scan and delete
    let cursor = 0;
    let deleted = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor =
        typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
        deleted += keys.length;
      }
    } while (cursor !== 0);

    if (deleted > 0) {
      log.info({ pattern, deleted }, "Cache invalidated");
    }
    return deleted;
  } catch (err) {
    log.warn({ err, pattern }, "Cache invalidation failed — non-blocking");
    return 0;
  }
}
```

### Cache key conventions

Use colon-separated hierarchical keys:

```
creator:{slug}                              → CreatorProfile data
creator:{slug}:snapshots:{platform}:{period} → Snapshot time-series
game:{slug}                                  → Game data
game:{slug}:snapshots:{period}               → Game viewer history
search:{queryHash}                           → Search results
trending:landing                             → Landing page trending data
```

### TTL values

```typescript
export const CACHE_TTL = {
  CREATOR_PROFILE: 300, // 5 minutes
  CREATOR_SNAPSHOTS: 300, // 5 minutes
  GAME_PROFILE: 300, // 5 minutes
  GAME_SNAPSHOTS: 300, // 5 minutes
  SEARCH_RESULTS: 120, // 2 minutes
  TRENDING_LANDING: 600, // 10 minutes
} as const;
```

### Integration into API routes

For each REST API route, add read-through caching. Example for `GET /api/creators/[slug]`:

```typescript
// In src/app/api/creators/[slug]/route.ts

import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import { serializeBigInt } from "@/app/api/_lib/serialize";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const { slug } = params;
  const cacheKey = `creator:${slug}`;

  // 1. Check cache
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return Response.json({ data: cached });
  }

  // 2. Cache miss — query DB
  const profile = await prisma.creatorProfile.findUnique({ where: { slug }, include: { ... } });
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });

  const serialized = serializeBigInt(profile);

  // 3. Cache result (non-blocking)
  await cacheSet(cacheKey, serialized, CACHE_TTL.CREATOR_PROFILE);

  return Response.json({ data: serialized });
}
```

### Important: BigInt serialization

**Always serialize before caching.** Upstash Redis uses JSON internally. BigInt is not JSON-serializable. Use the existing `serializeBigInt()` from `src/app/api/_lib/serialize.ts` before calling `cacheSet()`.

### DO NOT

- Do not cache authenticated/dashboard routes — only public pages
- Do not use `redis.keys()` in production — use `redis.scan()` for pattern matching
- Do not let cache failures break the request — always fall through to DB on error
- Do not cache mutation responses (POST/PUT/DELETE)

---

## Task 5.3.2 (P0) — Cache Invalidation on New Snapshots

### Goal

When snapshot workers write new data, invalidate relevant cache keys so public pages show fresh data.

### Files to modify

1. **`src/inngest/functions/snapshots/shared.ts`** — Add invalidation after snapshot write
2. **`src/server/services/cache.ts`** — Already created in 5.3.1

### Implementation

In `shared.ts`, after `snapshotPlatformAccount()` writes the snapshot and updates PlatformAccount, and after `updateProfileAggregates()`:

```typescript
import { cacheInvalidate } from "@/server/services/cache";

// Inside the batch processing loop, after updating profile aggregates:
try {
  // Get the creator's slug for cache key
  const creatorSlug = await getCreatorSlug(profile.id);
  if (creatorSlug) {
    await cacheInvalidate(`creator:${creatorSlug}`);
    await cacheInvalidate(`creator:${creatorSlug}:*`);
  }
} catch (err) {
  // Cache invalidation failure should never block snapshot processing
  log.warn(
    { err, creatorProfileId: profile.id },
    "Cache invalidation failed — continuing",
  );
}
```

Add a helper to fetch slug:

```typescript
async function getCreatorSlug(
  creatorProfileId: string,
): Promise<string | null> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { slug: true },
  });
  return profile?.slug ?? null;
}
```

### Also invalidate for games

In the game snapshot function (`src/inngest/functions/snapshots/game-snapshot.ts`), after writing `GameViewerSnapshot`:

```typescript
await cacheInvalidate(`game:${game.slug}`);
await cacheInvalidate(`game:${game.slug}:*`);
```

### Invalidate trending on any snapshot batch

After a full tier snapshot batch completes:

```typescript
await cacheInvalidate("trending:landing");
```

### DO NOT

- Do not invalidate eagerly per-account — invalidate once per profile after all accounts are processed
- Do not let invalidation failures break snapshot processing — always wrap in try/catch
- Do not invalidate search cache on snapshots — search data changes less frequently

---

## Task 5.3.3 (P1) — Next.js ISR for Public Pages

### Goal

Add Incremental Static Regeneration to high-traffic public pages for CDN caching.

### Files to modify

Public page Server Components:

1. Creator profile page
2. Game page
3. Landing page

### Implementation

For pages that should use ISR, add the `revalidate` export:

```typescript
// In the page.tsx file:
export const revalidate = 300; // Revalidate every 5 minutes
```

### Strategy

| Page                                 | ISR?    | Revalidate    | Rationale                                  |
| ------------------------------------ | ------- | ------------- | ------------------------------------------ |
| Landing page (`/`)                   | Yes     | 600s (10 min) | High traffic, trending data changes slowly |
| Creator profile (`/creators/[slug]`) | Dynamic | N/A           | Too many pages for static, use Redis cache |
| Game page (`/games/[slug]`)          | Dynamic | N/A           | Same — use Redis cache                     |
| Browse creators (`/creators`)        | Yes     | 300s (5 min)  | Paginated, first page can be ISR           |
| Browse games (`/games`)              | Yes     | 300s (5 min)  | Same logic                                 |

### For high-profile creators (optional optimization)

Generate static pages at build time for top creators using `generateStaticParams`:

```typescript
// src/app/(public)/creators/[slug]/page.tsx
export async function generateStaticParams() {
  const topCreators = await prisma.creatorProfile.findMany({
    where: { snapshotTier: "tier1" },
    select: { slug: true },
    take: 100,
  });
  return topCreators.map((c) => ({ slug: c.slug }));
}

export const revalidate = 300;
```

### DO NOT

- Do not add ISR to authenticated pages (dashboard, settings, etc.)
- Do not set revalidate too low (< 60s) — defeats the purpose
- Do not use ISR if the page reads from request headers/cookies — those are dynamic-only

---

## Task 5.3.4 — OAuth Token Refresh (Already Done)

**Status:** Complete. Implemented in `src/server/services/token-refresh.ts` and `src/inngest/functions/tokens/`.

No action needed. Included here for reference only.

---

## Validation checklist

- [ ] **5.3.1**: `cacheGet("nonexistent")` returns `null` (no error)
- [ ] **5.3.1**: `cacheSet("test:key", { foo: "bar" }, 60)` + `cacheGet("test:key")` returns `{ foo: "bar" }`
- [ ] **5.3.1**: API route returns cached response on second request (check logs for "Cache hit")
- [ ] **5.3.1**: BigInt values are serialized before caching (no JSON serialization errors)
- [ ] **5.3.2**: After running snapshot worker, cache keys for updated creators are cleared
- [ ] **5.3.2**: Snapshot processing continues even if cache invalidation fails
- [ ] **5.3.3**: Landing page serves from CDN cache (check `x-nextjs-cache: HIT` header)
- [ ] `pnpm build` succeeds — no type errors
- [ ] Dashboard (authenticated) pages are NOT cached
