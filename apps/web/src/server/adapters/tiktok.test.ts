import { afterEach, describe, expect, it, vi } from "vitest";
import { tiktokAdapter } from "./tiktok";
import { AdapterError } from "./types";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("tiktokAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps user info and recent video metrics into snapshot data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            user: {
              open_id: "open-123",
              display_name: "Creator",
              avatar_url: "https://example.com/avatar.jpg",
              username: "creator",
              profile_deep_link: "https://www.tiktok.com/@creator",
              follower_count: 1000,
              following_count: 50,
              likes_count: 12345,
              video_count: 12,
            },
          },
          error: { code: "ok", message: "", log_id: "log-1" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            videos: [
              {
                id: "1",
                like_count: 10,
                comment_count: 2,
                share_count: 1,
                view_count: 100,
              },
              {
                id: "2",
                like_count: 20,
                comment_count: 3,
                share_count: 4,
                view_count: 200,
              },
            ],
            has_more: false,
          },
          error: { code: "ok", message: "", log_id: "log-2" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await tiktokAdapter.fetchSnapshot("open-123", {
      isOAuthConnected: true,
      accessToken: "access-token",
    });

    expect(snapshot).toMatchObject({
      platform: "tiktok",
      platformUserId: "open-123",
      followerCount: 1000n,
      followingCount: 50n,
      totalViews: null,
      subscriberCount: null,
      postCount: 12,
    });
    expect(snapshot.extendedMetrics).toMatchObject({
      LIKES: 12345n,
      COMMENTS: 5,
      SHARES: 5,
      ENGAGEMENT_RATE: 40 / 300,
      RECENT_VIDEO_VIEWS: 300,
      RECENT_VIDEO_COUNT: 2,
      _username: "creator",
      _profileUrl: "https://www.tiktok.com/@creator",
    });
  });

  it("requires an OAuth access token for snapshots", async () => {
    await expect(
      tiktokAdapter.fetchSnapshot("open-123", {
        isOAuthConnected: false,
      }),
    ).rejects.toMatchObject({
      code: "auth_expired",
    });
  });

  it("maps TikTok authorization failures to auth_expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "access_token_invalid",
              message: "Invalid access token",
              log_id: "log-3",
            },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(
      tiktokAdapter.fetchSnapshot("open-123", {
        isOAuthConnected: true,
        accessToken: "bad-token",
      }),
    ).rejects.toBeInstanceOf(AdapterError);
  });
});
