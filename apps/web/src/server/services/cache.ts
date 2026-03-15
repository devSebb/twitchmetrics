import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("cache");

// ============================================================
// TTL CONSTANTS (seconds)
// ============================================================

export const CACHE_TTL = {
  CREATOR_PROFILE: 300, // 5 minutes
  CREATOR_SNAPSHOTS: 300, // 5 minutes
  CREATOR_LIST: 120, // 2 minutes
  GAME_PROFILE: 300, // 5 minutes
  GAME_SNAPSHOTS: 300, // 5 minutes
  GAME_LIST: 120, // 2 minutes
  SEARCH_RESULTS: 120, // 2 minutes
  TRENDING_LANDING: 600, // 10 minutes
} as const;

// ============================================================
// CACHE OPERATIONS
// ============================================================

/**
 * Get a cached value. Returns null on miss or error.
 * Never throws — always falls through to DB on failure.
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
 * Never throws — cache write failures are non-blocking.
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
 *   "creator:ninja"     — exact key
 *   "creator:ninja:*"   — all keys for this creator
 */
export async function cacheInvalidate(pattern: string): Promise<number> {
  try {
    // For exact keys (no wildcard), use del directly
    if (!pattern.includes("*")) {
      await redis.del(pattern);
      return 1;
    }

    // For patterns, scan and delete in batches
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
