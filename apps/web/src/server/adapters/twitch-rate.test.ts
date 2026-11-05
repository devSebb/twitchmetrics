import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetTwitchRateForTests,
  currentTwitchPriority,
  getTwitchRateStats,
  parseRateLimitHeaders,
  twitchRateLimitedFetch,
  withTwitchPriority,
} from "./twitch-rate";

const NOW = 1_800_000_000_000;

/** A clock whose sleeps only advance time. */
function fakeClock() {
  const sleeps: number[] = [];
  let now = NOW;
  return {
    sleeps,
    clock: {
      now: () => now,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        now += ms;
      },
    },
  };
}

function helixResponse(
  status: number,
  remaining: number,
  resetInSec = 30,
): Response {
  return new Response(JSON.stringify({ data: [] }), {
    status,
    headers: {
      "Ratelimit-Limit": "800",
      "Ratelimit-Remaining": String(remaining),
      "Ratelimit-Reset": String(NOW / 1000 + resetInSec),
    },
  });
}

const URL = "https://api.twitch.tv/helix/users?id=1";

describe("twitch-rate", () => {
  let sleeps: number[];

  beforeEach(() => {
    const fake = fakeClock();
    sleeps = fake.sleeps;
    __resetTwitchRateForTests(fake.clock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    __resetTwitchRateForTests();
  });

  it("parses the Ratelimit headers", () => {
    expect(parseRateLimitHeaders(helixResponse(200, 412).headers)).toEqual({
      limit: 800,
      remaining: 412,
      resetAtMs: NOW + 30_000,
    });
    expect(parseRateLimitHeaders(new Headers())).toBeNull();
  });

  it("no scope (a page request) never sleeps and never retries a 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(helixResponse(200, 0))
      .mockResolvedValue(helixResponse(429, 0));
    vi.stubGlobal("fetch", fetchMock);

    expect(currentTwitchPriority()).toBeNull();
    // Bucket reported empty: a page request still goes straight through.
    expect((await twitchRateLimitedFetch(URL)).status).toBe(200);
    const res = await twitchRateLimitedFetch(URL);

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([]);
  });

  it("a job scope waits for the reset when below its reserve", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(helixResponse(200, 99)) // job reserve is 100
      .mockResolvedValue(helixResponse(200, 799));
    vi.stubGlobal("fetch", fetchMock);

    await withTwitchPriority("job", async () => {
      await twitchRateLimitedFetch(URL); // no reading yet: no wait
      await twitchRateLimitedFetch(URL); // 99 < 100: wait for the reset
    });

    expect(sleeps).toEqual([30_250]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a job scope above its reserve does not wait", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(helixResponse(200, 400)));
    await withTwitchPriority("tier", async () => {
      await twitchRateLimitedFetch(URL);
      await twitchRateLimitedFetch(URL);
    });
    expect(sleeps).toEqual([]);
  });

  it("a job scope waits for Ratelimit-Reset on a 429, then retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(helixResponse(429, 0, 12))
      .mockResolvedValue(helixResponse(200, 799));
    vi.stubGlobal("fetch", fetchMock);

    const res = await withTwitchPriority("job", () =>
      twitchRateLimitedFetch(URL),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([12_250]);
    expect(getTwitchRateStats()).toMatchObject({ rateLimited: 1, calls: 2 });
  });

  it("a job scope gives up after a few 429s and returns the last one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(helixResponse(429, 0, 5));
    vi.stubGlobal("fetch", fetchMock);

    const res = await withTwitchPriority("job", () =>
      twitchRateLimitedFetch(URL),
    );

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(4); // first try + 3 retries
  });

  it("never waits longer than a minute", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(helixResponse(429, 0, 600))
      .mockResolvedValue(helixResponse(200, 799));
    vi.stubGlobal("fetch", fetchMock);

    await withTwitchPriority("sweep", () => twitchRateLimitedFetch(URL));
    expect(sleeps).toEqual([60_000]);
  });

  it("overlapping job calls can't all pass on one stale reading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(helixResponse(200, 103)));
    await withTwitchPriority("job", () => twitchRateLimitedFetch(URL));

    // 103 left, job keeps 100: 4 go out (103, 102, 101, 100), the 5th waits.
    await withTwitchPriority("job", () =>
      Promise.all(Array.from({ length: 5 }, () => twitchRateLimitedFetch(URL))),
    );

    expect(sleeps).toEqual([30_250]);
  });

  it("callers waking from one reset share the refilled bucket", async () => {
    let now = NOW;
    const wake: Array<() => void> = [];
    __resetTwitchRateForTests({
      now: () => now,
      sleep: (ms) =>
        new Promise<void>((resolve) => {
          sleeps.push(ms);
          wake.push(resolve);
        }),
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    // Seed: empty bucket of 102, resetting in 30 s. Later responses never
    // arrive, so only the local bookkeeping decides who goes out.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("{}", {
          headers: {
            "Ratelimit-Limit": "102",
            "Ratelimit-Remaining": "0",
            "Ratelimit-Reset": String(NOW / 1000 + 30),
          },
        }),
      )
      .mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    await withTwitchPriority("job", () => twitchRateLimitedFetch(URL));

    withTwitchPriority("job", () => {
      for (let i = 0; i < 4; i++) void twitchRateLimitedFetch(URL);
    });
    await flush();
    expect(sleeps).toHaveLength(4);

    now = NOW + 30_250;
    for (const resolve of wake.splice(0)) resolve();
    await flush();

    // Refilled once to 102: three go out (102, 101, 100), the fourth sees 99
    // and waits again. Refilling per waiter would have let all four through.
    expect(fetchMock).toHaveBeenCalledTimes(1 + 3);
    expect(sleeps).toHaveLength(5);
  });

  it("a bucket smaller than the reserve still lets one call through per reset", async () => {
    // Limit 120 at tier priority (reserve 150): a full bucket never reaches
    // the reserve, so without the clamp the gate would wait forever.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", {
        headers: {
          "Ratelimit-Limit": "120",
          "Ratelimit-Remaining": "119",
          "Ratelimit-Reset": String(NOW / 1000 + 30),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await withTwitchPriority("tier", async () => {
      await twitchRateLimitedFetch(URL); // no reading yet: goes out
      await twitchRateLimitedFetch(URL); // 119 < 120: waits once, then goes
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([30_250]);
  });

  it("nested scopes take the innermost", async () => {
    const seen = await withTwitchPriority("job", async () => {
      const outer = currentTwitchPriority();
      const inner = await withTwitchPriority("game", async () =>
        currentTwitchPriority(),
      );
      return { outer, inner, after: currentTwitchPriority() };
    });
    expect(seen).toEqual({ outer: "job", inner: "game", after: "job" });
  });

  it("TWITCH_RATE_PRIORITY sets the process default; a scope still wins", () => {
    vi.stubEnv("TWITCH_RATE_PRIORITY", "sweep");
    expect(currentTwitchPriority()).toBe("sweep");
    expect(withTwitchPriority("tier", () => currentTwitchPriority())).toBe(
      "tier",
    );
    vi.stubEnv("TWITCH_RATE_PRIORITY", "nonsense");
    expect(currentTwitchPriority()).toBeNull();
  });
});
