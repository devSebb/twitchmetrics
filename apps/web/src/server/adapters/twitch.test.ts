import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFollowerTotal, withTwitchPriority } from "./twitch";
import { __resetTwitchRateForTests } from "./twitch-rate";
import { AdapterError } from "./types";

const NOW = 1_800_000_000_000;

function helix(status: number, body: unknown = { data: [], total: 42 }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Ratelimit-Limit": "800",
      "Ratelimit-Remaining": status === 429 ? "0" : "700",
      "Ratelimit-Reset": String(NOW / 1000 + 10),
    },
  });
}

/** fetch mock: the OAuth token call, then `helixResponses` in order. */
function stubTwitch(...helixResponses: Response[]) {
  const helixMock = vi.fn();
  for (const r of helixResponses) helixMock.mockResolvedValueOnce(r);
  const fetchMock = vi.fn(async (url: string) =>
    url.startsWith("https://id.twitch.tv/")
      ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), {
          status: 200,
        })
      : helixMock(url),
  );
  vi.stubGlobal("fetch", fetchMock);
  return helixMock;
}

describe("twitch adapter rate handling", () => {
  let sleeps: number[];

  beforeEach(() => {
    vi.stubEnv("TWITCH_CLIENT_ID", "id");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "secret");
    sleeps = [];
    let now = NOW;
    __resetTwitchRateForTests({
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    __resetTwitchRateForTests();
  });

  it("a page request fails fast on 429: one call, no retry, no sleep", async () => {
    const helixMock = stubTwitch(helix(429), helix(200));

    const err = await fetchFollowerTotal("123").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AdapterError);
    expect((err as AdapterError).code).toBe("rate_limited");
    expect((err as AdapterError).retryable).toBe(false);
    expect(helixMock).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("a job waits for the reset on 429 and gets the answer", async () => {
    const helixMock = stubTwitch(helix(429), helix(200));

    const total = await withTwitchPriority("job", () =>
      fetchFollowerTotal("123"),
    );

    expect(total).toBe(42);
    expect(helixMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([10_250]);
  });
});

describe("twitch app token", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("overlapping callers with a cold cache share one token request", async () => {
    vi.stubEnv("TWITCH_CLIENT_ID", "id");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "secret");
    vi.resetModules(); // fresh module: no cached token
    const { fetchFollowerTotal: fresh } = await import("./twitch");
    let tokenCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://id.twitch.tv/")) {
          tokenCalls++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return new Response(
            JSON.stringify({ access_token: "t", expires_in: 3600 }),
          );
        }
        return helix(200);
      }),
    );

    const totals = await Promise.all(
      Array.from({ length: 5 }, () => fresh("123")),
    );

    expect(totals).toEqual([42, 42, 42, 42, 42]);
    expect(tokenCalls).toBe(1);
  });
});
