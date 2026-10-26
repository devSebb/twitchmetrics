import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepMode } from "inngest/types";
import { inngest } from "../client";
import {
  fetchFollowerTotal,
  withTwitchPriority,
} from "@/server/adapters/twitch";
import {
  __resetTwitchRateForTests,
  currentTwitchPriority,
} from "@/server/adapters/twitch-rate";

const NOW = 1_800_000_000_000;

function helix(status: number) {
  return new Response(JSON.stringify({ data: [], total: 42 }), {
    status,
    headers: {
      "Ratelimit-Limit": "800",
      "Ratelimit-Remaining": status === 429 ? "0" : "700",
      "Ratelimit-Reset": String(NOW / 1000 + 10),
    },
  });
}

function stubTwitch(...helixResponses: Response[]) {
  const helixMock = vi.fn();
  for (const r of helixResponses) helixMock.mockResolvedValueOnce(r);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("https://id.twitch.tv/")
        ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }))
        : helixMock(url),
    ),
  );
  return helixMock;
}

/**
 * Run one execution of `fn` through the real Inngest SDK (the app's client,
 * with its middleware), the way the serve handler does for a request that
 * runs the function's first step. Returns that step's output.
 */
async function runFirstStep(
  fn: ReturnType<typeof inngest.createFunction>,
): Promise<unknown> {
  const execution = fn["createExecution"]({
    version: 1,
    partialOptions: {
      client: inngest,
      runId: "run-1",
      data: {
        event: { name: "test/r10", data: {} },
        events: [{ name: "test/r10", data: {} }],
        runId: "run-1",
        attempt: 0,
      },
      reqArgs: [],
      headers: {},
      stepState: {},
      stepCompletionOrder: [],
      stepMode: StepMode.Async,
    },
  });
  const result = await execution.start();
  if (result.type !== "step-ran") {
    throw new Error(`expected step-ran, got ${result.type}`);
  }
  return result.step.data;
}

describe("Inngest default Twitch priority (R10)", () => {
  let sleeps: number[];

  beforeEach(() => {
    vi.stubEnv("TWITCH_CLIENT_ID", "id");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "secret");
    vi.stubEnv("TWITCH_RATE_PRIORITY", ""); // as on Vercel
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

  it("a step with no explicit scope gets job behaviour", async () => {
    const helixMock = stubTwitch(helix(429), helix(200));
    const fn = inngest.createFunction(
      { id: "r10-default-scope" },
      { event: "test/r10" },
      async ({ step }) =>
        step.run("followers", async () => ({
          priority: currentTwitchPriority(),
          total: await fetchFollowerTotal("123"),
        })),
    );

    const out = await runFirstStep(fn);

    // Job, not page-request: it waited for the reset and retried the 429
    // instead of failing fast.
    expect(out).toEqual({ priority: "job", total: 42 });
    expect(helixMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([10_250]);
  });

  it("an explicit scope inside a step wins over the default", async () => {
    const fn = inngest.createFunction(
      { id: "r10-explicit-scope" },
      { event: "test/r10" },
      async ({ step }) =>
        step.run("game", () =>
          withTwitchPriority("game", async () => currentTwitchPriority()),
        ),
    );
    expect(await runFirstStep(fn)).toBe("game");
  });

  it("outside Inngest, the same call is a page request and fails fast", async () => {
    const helixMock = stubTwitch(helix(429), helix(200));
    await expect(fetchFollowerTotal("123")).rejects.toMatchObject({
      code: "rate_limited",
    });
    expect(helixMock).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });
});
