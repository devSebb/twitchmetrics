/**
 * Twitch Helix rate pacing, shared by every caller of the API.
 *
 * Helix gives the app one bucket (~800 points/min) for every process using
 * the client id: page requests on Vercel, Inngest functions in the same
 * Vercel process, and the GitHub workers. Each response reports the bucket in
 * `Ratelimit-Limit` / `Ratelimit-Remaining` / `Ratelimit-Reset` (epoch s).
 *
 * Priority is per call, not per process, because page requests and Inngest
 * steps share one Node process on Vercel. `withTwitchPriority(p, fn)` sets it
 * for everything `fn` awaits (AsyncLocalStorage); the innermost scope wins.
 *
 *   - No scope = a page request: never sleeps, and a 429 fails fast.
 *   - A job scope keeps `reserve` points free for higher priorities: below it,
 *     the call waits for the bucket's reset. On a 429 it waits for
 *     `Ratelimit-Reset` and retries, instead of hammering with backoff.
 *
 * Every Inngest step runs in the "job" scope by default (the twitch-priority
 * middleware on the Inngest client). On GitHub, `TWITCH_RATE_PRIORITY` sets
 * the scope for the whole worker process; Vercel never sets it.
 *
 * No `@/` imports: root workers run with plain `npx tsx` and import this file
 * by relative path.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type TwitchPriority = "job" | "game" | "tier" | "sweep";

/**
 * Points each priority leaves in the bucket for others. Higher reserve =
 * lower priority: it backs off first. Page requests use none.
 */
export const TWITCH_RESERVE: Record<TwitchPriority, number> = {
  game: 50,
  job: 100,
  tier: 150,
  sweep: 350,
};

/** Longest single wait for a reset; Helix resets the bucket within a minute. */
const MAX_WAIT_MS = 60_000;
/** Slack after the reported reset, so the bucket has really refilled. */
const RESET_SLACK_MS = 250;
/** 429 retries inside a job scope, each after waiting for the reset. */
const MAX_429_RETRIES = 3;

const scope = new AsyncLocalStorage<TwitchPriority>();

function isPriority(value: string | undefined): value is TwitchPriority {
  return value != null && value in TWITCH_RESERVE;
}

/** Run `fn` (and everything it awaits) at priority `priority`. */
export function withTwitchPriority<T>(
  priority: TwitchPriority,
  fn: () => T,
): T {
  return scope.run(priority, fn);
}

/** The priority of the current call; null = a page request. */
export function currentTwitchPriority(): TwitchPriority | null {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  const fromEnv = process.env.TWITCH_RATE_PRIORITY?.trim();
  return isPriority(fromEnv) ? fromEnv : null;
}

// ============================================================
// BUCKET STATE (last headers seen by this process)
// ============================================================

type Bucket = { limit: number; remaining: number; resetAtMs: number };

let bucket: Bucket | null = null;

export type TwitchRateStats = {
  calls: number;
  waits: number;
  waitMs: number;
  rateLimited: number;
  minRemaining: number | null;
};

const stats: TwitchRateStats = {
  calls: 0,
  waits: 0,
  waitMs: 0,
  rateLimited: 0,
  minRemaining: null,
};

/** Counters since process start (or the last reset), for job logs. */
export function getTwitchRateStats(): TwitchRateStats {
  return { ...stats };
}

/** Parse the three Ratelimit-* headers; null when any is missing. */
export function parseRateLimitHeaders(headers: Headers): Bucket | null {
  const limit = Number(headers.get("ratelimit-limit"));
  const remaining = Number(headers.get("ratelimit-remaining"));
  const reset = Number(headers.get("ratelimit-reset"));
  if (
    !headers.has("ratelimit-remaining") ||
    !headers.has("ratelimit-reset") ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(reset)
  ) {
    return null;
  }
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : 800,
    remaining,
    resetAtMs: reset * 1000,
  };
}

function record(headers: Headers): void {
  const parsed = parseRateLimitHeaders(headers);
  if (!parsed) return;
  bucket = parsed;
  stats.minRemaining =
    stats.minRemaining == null
      ? parsed.remaining
      : Math.min(stats.minRemaining, parsed.remaining);
}

// ============================================================
// PACED FETCH
// ============================================================

type Clock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

let clock: Clock = realClock;

async function waitFor(ms: number): Promise<void> {
  const capped = Math.min(Math.max(ms, 0), MAX_WAIT_MS);
  stats.waits += 1;
  stats.waitMs += capped;
  await clock.sleep(capped);
}

/** Before a job-scope call: wait for the reset when below the reserve. */
async function gate(priority: TwitchPriority): Promise<void> {
  if (!bucket) return;
  const now = clock.now();
  if (bucket.resetAtMs <= now) {
    // The reported window is over; the bucket has refilled.
    bucket = { ...bucket, remaining: bucket.limit };
  }
  if (bucket.remaining < TWITCH_RESERVE[priority]) {
    await waitFor(bucket.resetAtMs - now + RESET_SLACK_MS);
    bucket = { ...bucket, remaining: bucket.limit };
  }
  // Count this call before its response arrives, so concurrent calls in this
  // process don't all pass the gate on the same stale reading.
  bucket.remaining -= 1;
}

/**
 * `fetch` for a Helix URL with pacing. Returns the final Response; a 429 is
 * returned (not thrown) so the caller keeps its own error type. In a page
 * request that 429 comes back at once. In a job scope it comes back only
 * after MAX_429_RETRIES waits for the reset.
 */
export async function twitchRateLimitedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const priority = currentTwitchPriority();
  for (let attempt = 0; ; attempt++) {
    if (priority) await gate(priority);
    stats.calls += 1;
    const res = await fetch(url, init);
    record(res.headers);
    if (res.status !== 429) return res;

    stats.rateLimited += 1;
    if (!priority || attempt >= MAX_429_RETRIES) return res;
    const resetAtMs = parseRateLimitHeaders(res.headers)?.resetAtMs;
    await waitFor(
      resetAtMs != null
        ? resetAtMs - clock.now() + RESET_SLACK_MS
        : 1000 * 2 ** attempt,
    );
    // The retry goes out now; its response brings fresh headers. Without
    // this the gate would read the 429's "0 remaining" and wait again.
    if (bucket) bucket = { ...bucket, remaining: bucket.limit };
  }
}

/** Test hook: a fake clock and a clean bucket. */
export function __resetTwitchRateForTests(testClock?: Clock): void {
  clock = testClock ?? realClock;
  bucket = null;
  stats.calls = 0;
  stats.waits = 0;
  stats.waitMs = 0;
  stats.rateLimited = 0;
  stats.minRemaining = null;
}
