# Stage 5 — Part 2: Remaining Platform Adapters & Registry

> **Scope:** Adapter registry, Instagram/TikTok/X adapter stubs (or implementations)
> **Priority:** P0 (registry) + P1 (adapters) · **Estimated effort:** ~8h
> **Depends on:** Existing adapter pattern (twitch.ts, youtube.ts, types.ts)

---

## Architecture Context

### Adapter pattern — how it works

Every platform integration implements the `PlatformAdapter` interface defined in `src/server/adapters/types.ts`:

```typescript
interface PlatformAdapter {
  readonly platform: Platform;
  fetchProfile(platformUsername: string): Promise<CreatorProfileData>;
  fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  fetchTopGames?(limit?: number): Promise<GameSnapshotData[]>;
}
```

**Error handling** uses `AdapterError` with typed codes: `rate_limited`, `auth_expired`, `not_found`, `api_error`, `network_error`. Set `retryable: true` for transient errors (rate_limited, network_error).

### Existing implementations

| File                                          | Platform | Status | Key patterns                                                                              |
| --------------------------------------------- | -------- | ------ | ----------------------------------------------------------------------------------------- |
| `src/server/adapters/twitch.ts` (~480 lines)  | Twitch   | Stable | App token caching (5-min refresh), 3-attempt retry with backoff, `fetchClips()` extension |
| `src/server/adapters/youtube.ts` (~200 lines) | YouTube  | Beta   | In-memory daily quota tracking (10K units), warns at 80%, errors at 95%                   |

### Naming conventions

- File: `src/server/adapters/{platform}.ts` (lowercase)
- Export: `{platform}Adapter` (camelCase instance, e.g., `export const twitchAdapter = new TwitchAdapter()`)
- Class: `{Platform}Adapter` (PascalCase, e.g., `class TwitchAdapter implements PlatformAdapter`)
- Logger: `createLogger("{platform}-adapter")`

### Return types (from `types.ts`)

```typescript
type CreatorProfileData = {
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string;
  platformUrl: string | null;
  platformAvatarUrl: string | null;
  followerCount: bigint | null;
  followingCount: bigint | null;
  totalViews: bigint | null;
  postCount: number | null;
  isLive: boolean | null;
};

type CreatorSnapshotData = {
  platform: Platform;
  platformUserId: string;
  snapshotAt: Date;
  followerCount: bigint | null;
  followingCount: bigint | null;
  totalViews: bigint | null;
  subscriberCount: bigint | null;
  postCount: number | null;
  extendedMetrics: Partial<Record<MetricKey, number | bigint | string | null>>;
};
```

### Platform config (from `src/lib/constants/platforms.ts`)

Each platform has a `PlatformConfigEntry` with:

- `adapterStatus`: `"stable"` | `"beta"` | `"planned"` | `"unavailable"`
- `tier0Metrics`: Public metrics (no OAuth needed)
- `requiresUserConsent`: OAuth-gated metrics
- `oauthScopes`: Required OAuth permissions

### Rate limiters (from `src/lib/redis.ts`)

All 6 platform limiters already exist:

```typescript
instagramApiLimiter; // 200 calls per hour
tiktokApiLimiter; // 100 per minute
xApiLimiter; // 500 per 15-minute window
```

---

## Task 5.2.4 (P0) — Adapter Registry

### Goal

Create a single `getAdapter(platform)` entrypoint so all workers and services use one lookup instead of importing specific adapters.

### File to create

`src/server/adapters/index.ts`

### Implementation

```typescript
import type { Platform } from "@twitchmetrics/database";
import type { PlatformAdapter } from "./types";
import { twitchAdapter } from "./twitch";
import { youtubeAdapter } from "./youtube";
// Import new adapters as they're created:
// import { instagramAdapter } from "./instagram";
// import { tiktokAdapter } from "./tiktok";
// import { xAdapter } from "./x";

const ADAPTER_MAP: Partial<Record<Platform, PlatformAdapter>> = {
  twitch: twitchAdapter,
  youtube: youtubeAdapter,
  // instagram: instagramAdapter,
  // tiktok: tiktokAdapter,
  // x: xAdapter,
};

/**
 * Returns the adapter for a given platform, or null if not yet implemented.
 * All workers and services should use this instead of importing specific adapters.
 */
export function getAdapter(platform: Platform): PlatformAdapter | null {
  return ADAPTER_MAP[platform] ?? null;
}

/**
 * Returns all currently active adapters (non-null entries).
 */
export function getActiveAdapters(): PlatformAdapter[] {
  return Object.values(ADAPTER_MAP).filter(
    (a): a is PlatformAdapter => a != null,
  );
}

// Re-export types for convenience
export { type PlatformAdapter, AdapterError } from "./types";
export type {
  CreatorProfileData,
  CreatorSnapshotData,
  SearchResult,
  GameSnapshotData,
} from "./types";
```

### Files to update after creating registry

1. **`src/inngest/functions/snapshots/shared.ts`** — Replace the inline `getAdapterForPlatform()` function:

   ```typescript
   // BEFORE (line 17-26):
   // function getAdapterForPlatform(platform: Platform): PlatformAdapter | null { ... }

   // AFTER:
   import { getAdapter } from "@/server/adapters";
   // Then use getAdapter(platform) instead of getAdapterForPlatform(platform)
   ```

2. **Any future service or worker** that needs a platform adapter should import from `@/server/adapters` (the index).

### DO NOT

- Do not remove individual adapter exports — `import { twitchAdapter } from "@/server/adapters/twitch"` should still work
- Do not make `getAdapter()` throw on missing adapters — return `null` and let callers decide

---

## Task 5.2.1 (P1) — InstagramAdapter

### Goal

Create Instagram adapter. If Meta app is approved: implement real API calls. If NOT: implement as a stub returning `null` values.

### File to create

`src/server/adapters/instagram.ts`

### Instagram Graph API specifics

- **Base URL:** `https://graph.instagram.com`
- **Auth:** User access token (per-creator, from OAuth flow)
- **Key endpoints:**
  - `GET /me?fields=id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count` — Profile + basic metrics
  - `GET /me/media?fields=id,timestamp,media_type,like_count,comments_count` — Per-post metrics
  - `GET /{media-id}/insights?metric=impressions,reach,engagement` — Post insights (requires `instagram_manage_insights` scope)
- **Limitations:** Only works for Business/Creator accounts linked to a Facebook Page. Personal accounts cannot use Graph API.
- **Rate limit:** 200 calls/hour per user token (already in `redis.ts`)

### Implementation pattern

```typescript
import type { Platform } from "@twitchmetrics/database";
import type {
  PlatformAdapter,
  CreatorProfileData,
  CreatorSnapshotData,
  SearchResult,
} from "./types";
import { AdapterError } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("instagram-adapter");

class InstagramAdapter implements PlatformAdapter {
  readonly platform: Platform = "instagram";

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    // Instagram Graph API does not support username lookup without auth.
    // If approved: use token-based lookup
    // If not approved: throw AdapterError with code "api_error"
    throw new AdapterError(
      "instagram",
      "api_error",
      "Instagram adapter not yet approved — profile lookup unavailable",
    );
  }

  async fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    if (!options.isOAuthConnected || !options.accessToken) {
      throw new AdapterError(
        "instagram",
        "auth_expired",
        "Instagram requires OAuth connection for snapshots",
      );
    }

    // If approved: call GET /me?fields=followers_count,follows_count,media_count
    // Parse response into CreatorSnapshotData
    // If NOT approved yet: return stub data

    // STUB IMPLEMENTATION (replace when approved):
    log.warn(
      { platformUserId },
      "Instagram adapter not approved — returning stub snapshot",
    );
    return {
      platform: "instagram",
      platformUserId,
      snapshotAt: new Date(),
      followerCount: null,
      followingCount: null,
      totalViews: null,
      subscriberCount: null,
      postCount: null,
      extendedMetrics: {},
    };
  }

  async search(query: string, limit?: number): Promise<SearchResult[]> {
    // Instagram Graph API does not support search
    return [];
  }
}

export const instagramAdapter = new InstagramAdapter();
```

### When Meta app IS approved

Replace the stub `fetchSnapshot` with real API calls:

```typescript
const res = await fetch(
  `https://graph.instagram.com/me?fields=id,username,name,followers_count,follows_count,media_count&access_token=${options.accessToken}`,
);
```

### Update platform config

In `src/lib/constants/platforms.ts`, update Instagram `adapterStatus` from `"planned"` to `"beta"` once the real adapter is working.

### Register in adapter index

In `src/server/adapters/index.ts`, uncomment the instagram import and add to `ADAPTER_MAP`.

---

## Task 5.2.2 (P1) — TikTokAdapter

### Goal

Create TikTok adapter stub. TikTok API access requires review (1–4 weeks). Ship with stub.

### File to create

`src/server/adapters/tiktok.ts`

### TikTok API specifics

- **Base URL:** `https://open.tiktokapis.com/v2`
- **Login Kit API:** `GET /user/info/?fields=follower_count,following_count,likes_count,video_count`
- **Display API:** Per-video metrics (views, likes, comments, shares)
- **Auth:** OAuth 2.0, but access requires app review
- **Rate limit:** ~100/min (already in `redis.ts`)

### Implementation

Follow the exact same stub pattern as Instagram above:

```typescript
class TikTokAdapter implements PlatformAdapter {
  readonly platform: Platform = "tiktok";
  // All methods throw AdapterError or return empty/null stubs
}

export const tiktokAdapter = new TikTokAdapter();
```

Use logger: `createLogger("tiktok-adapter")`

### DO NOT

- Do not block on TikTok API approval — ship the stub
- Do not hardcode test data — return `null` values in stub mode

---

## Task 5.2.3 (P1) — XAdapter

### Goal

Create X (Twitter) adapter using API v2 Basic tier ($100/mo).

### File to create

`src/server/adapters/x.ts`

### X API v2 specifics

- **Base URL:** `https://api.twitter.com/2`
- **Auth:** OAuth 2.0 Bearer token or user context token
- **Key endpoint:** `GET /users/:id?user.fields=public_metrics` returns:
  ```json
  {
    "data": {
      "public_metrics": {
        "followers_count": 1234,
        "following_count": 56,
        "tweet_count": 789
      }
    }
  }
  ```
- **Username lookup:** `GET /users/by/username/:username?user.fields=public_metrics`
- **Rate limit:** 300 requests per 15-min window (Basic tier). Already configured as 500 in `redis.ts` — adjust if needed.
- **Limitation:** Impression/engagement metrics NOT available at Basic tier. Pro tier ($5K/mo) needed.

### Implementation

```typescript
class XAdapter implements PlatformAdapter {
  readonly platform: Platform = "x";

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
      throw new AdapterError("x", "api_error", "X bearer token not configured");
    }

    const res = await fetch(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(platformUsername)}?user.fields=public_metrics,profile_image_url,description`,
      { headers: { Authorization: `Bearer ${bearerToken}` } },
    );

    if (res.status === 429)
      throw new AdapterError("x", "rate_limited", "X API rate limited", true);
    if (res.status === 404)
      throw new AdapterError(
        "x",
        "not_found",
        `User @${platformUsername} not found`,
      );
    if (!res.ok)
      throw new AdapterError("x", "api_error", `X API error: ${res.status}`);

    const json = await res.json();
    const user = json.data;
    const metrics = user.public_metrics;

    return {
      platform: "x",
      platformUserId: user.id,
      platformUsername: user.username,
      platformDisplayName: user.name,
      platformUrl: `https://x.com/${user.username}`,
      platformAvatarUrl: user.profile_image_url ?? null,
      followerCount: BigInt(metrics.followers_count),
      followingCount: BigInt(metrics.following_count),
      totalViews: null, // Not available at Basic tier
      postCount: metrics.tweet_count,
      isLive: null, // X doesn't have live streaming indicator
    };
  }

  async fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    // Similar to fetchProfile but by ID: GET /users/:id?user.fields=public_metrics
    // ...
  }

  async search(query: string, limit?: number): Promise<SearchResult[]> {
    // X search API is very limited at Basic tier
    // Return empty for now
    return [];
  }
}

export const xAdapter = new XAdapter();
```

### Environment variable

Add to `.env.example`:

```
X_BEARER_TOKEN=             # X API v2 Bearer Token (Basic tier)
```

### Register in adapter index

In `src/server/adapters/index.ts`, add to `ADAPTER_MAP`.

---

## Validation checklist

After implementing each task, verify:

- [ ] **5.2.4**: Import `getAdapter` from `@/server/adapters` — returns `twitchAdapter` for "twitch", `youtubeAdapter` for "youtube", `null` for others
- [ ] **5.2.4**: `shared.ts` updated to use `getAdapter()` from registry — Inngest snapshot functions still work
- [ ] **5.2.1**: `instagramAdapter.fetchSnapshot()` returns stub data without crashing
- [ ] **5.2.2**: `tiktokAdapter.fetchSnapshot()` returns stub data without crashing
- [ ] **5.2.3**: `xAdapter.fetchProfile("elonmusk")` returns profile data (requires `X_BEARER_TOKEN`)
- [ ] `pnpm build` succeeds — no type errors
- [ ] `getActivePlatforms()` still returns only stable + beta platforms (stubs don't change `adapterStatus`)
- [ ] No new adapters are imported in client-side code (server-only boundary)
