import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { xAdapter } from "./x";
import { AdapterError } from "./types";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const X_USER = {
  id: "190266167",
  name: "Samuel Étienne",
  username: "SamuelEtienne",
  profile_image_url: "https://example.com/avatar.jpg",
  public_metrics: {
    followers_count: 403408,
    following_count: 812,
    tweet_count: 15230,
    listed_count: 512,
  },
};

describe("xAdapter", () => {
  beforeEach(() => {
    vi.stubEnv("TWITTER_BEARER_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("snapshots a numeric platformUserId via the by-ID endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: X_USER }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await xAdapter.fetchSnapshot("190266167", {
      isOAuthConnected: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/users/190266167?user.fields="),
      expect.anything(),
    );
    expect(snapshot).toMatchObject({
      platform: "x",
      platformUserId: "190266167",
      followerCount: 403408n,
      followingCount: 812n,
      postCount: 15230,
      totalViews: null,
      subscriberCount: null,
    });
    expect(snapshot.extendedMetrics).toMatchObject({
      LISTED_COUNT: 512n,
    });
  });

  it("snapshots a handle-keyed platformUserId via the by-username endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: X_USER }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await xAdapter.fetchSnapshot("@samueletienne", {
      isOAuthConnected: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/users/by/username/samueletienne?user.fields="),
      expect.anything(),
    );
    expect(snapshot.followerCount).toBe(403408n);
  });

  it("exposes transport fields so the snapshot worker can heal handle keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: X_USER })),
    );

    const snapshot = await xAdapter.fetchSnapshot("samueletienne", {
      isOAuthConnected: false,
    });

    expect(snapshot.extendedMetrics).toMatchObject({
      _resolvedUserId: "190266167",
      _username: "SamuelEtienne",
      _displayName: "Samuel Étienne",
      _avatarUrl: "https://example.com/avatar.jpg",
    });
  });

  it("throws not_found (non-retryable) when the user does not exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          errors: [{ detail: "Not found", title: "Not Found", type: "x" }],
        }),
      ),
    );

    await expect(
      xAdapter.fetchSnapshot("ghosthandle", { isOAuthConnected: false }),
    ).rejects.toMatchObject(
      new AdapterError("x", "not_found", "X user 'ghosthandle' not found"),
    );
  });

  it("throws rate_limited on 429 without hammering retries forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { status: 429 })),
    );

    await expect(
      xAdapter.fetchSnapshot("190266167", { isOAuthConnected: false }),
    ).rejects.toMatchObject({ platform: "x", code: "rate_limited" });
  }, 15_000);
});
