import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  analytics: vi.fn(),
  audience: vi.fn(),
  creator: vi.fn(),
}));
vi.mock("@/server/db", () => ({
  db: {
    creatorProfile: { findUnique: queries.creator },
    creatorAnalytics: { findMany: queries.analytics },
    audienceDemographics: { findMany: queries.audience },
  },
}));
vi.mock("@/server/services/profile-widget-availability", () => ({
  getProfileDataAvailability: vi.fn(async () => ({
    follower_growth: true,
    viewer_count: false,
    recent_streams: false,
    popular_games: false,
    featured_clips: false,
  })),
}));
vi.mock("@/server/services/creator-streaming-stats", () => ({
  getStatsContext: vi.fn(async () => ({
    initialPeriod: "30d",
    lastStreamDay: null,
  })),
}));
import {
  getPublicCreatorView,
  type PublicCreator,
} from "./public-creator-view";

function fixture(overrides: Record<string, unknown> = {}): PublicCreator {
  return {
    id: "creator-1",
    slug: "sample",
    displayName: "Sample",
    state: "claimed",
    primaryPlatform: "youtube",
    avatarUrl: null,
    customAvatarUrl: null,
    bannerUrl: null,
    bio: "Public bio",
    country: "GB",
    language: "en",
    gender: null,
    age: null,
    interests: [],
    totalFollowers: 125n,
    totalViews: 500n,
    widgetConfig: ["stats_row", "demographics"],
    publicDemographicsEnabled: false,
    userId: "private-owner-id",
    ownerEmail: "private@example.test",
    internalNotes: "Never public",
    platformAccounts: [
      {
        platform: "youtube",
        platformUsername: "sample",
        platformUrl: null,
        followerCount: 100n,
        otherChannelsFollowerCount: 25n,
        totalViews: 500n,
        postCount: 4,
        lastSyncedAt: new Date("2026-11-20T00:00:00Z"),
        isOAuthConnected: true,
        discoverySource: null,
      },
    ],
    growthRollups: [],
    brandPartnerships: [],
    ...overrides,
  } as unknown as PublicCreator;
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.analytics.mockResolvedValue([
    {
      platform: "youtube",
      ageGenderData: { male: { "18-24": 0.6 } },
      countryData: { GB: 0.5 },
    },
  ]);
  queries.audience.mockResolvedValue([]);
});

describe("public creator presentation used by profile, kit and owner kit preview", () => {
  it("passes the primary game and last stream date to the header", async () => {
    const view = await getPublicCreatorView(
      fixture({
        primaryGameName: "Fortnite",
        lastStreamAt: new Date("2026-11-21T08:00:00Z"),
      }),
    );
    expect(view.headerData.primaryGameName).toBe("Fortnite");
    expect(view.headerData.lastStreamAt).toBe("2026-11-21T08:00:00.000Z");
  });
  it("does not request or serialise first-party demographics when sharing is off, even for a claimed connected creator", async () => {
    const view = await getPublicCreatorView(fixture());
    expect(queries.analytics).not.toHaveBeenCalled();
    expect(view.profile.demographicAnalytics).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("private-owner-id");
    expect(JSON.stringify(view)).not.toContain("private@example.test");
    expect(JSON.stringify(view)).not.toContain("Never public");
    expect(view.profile).not.toHaveProperty("userId");
    expect(view.profile).not.toHaveProperty("ownerEmail");
  });
  it("withholds first-party analytics when a claim is no longer active", async () => {
    const view = await getPublicCreatorView(
      fixture({ state: "unclaimed", publicDemographicsEnabled: true }),
    );
    expect(queries.analytics).not.toHaveBeenCalled();
    expect(view.profile.demographicAnalytics).toEqual([]);
  });
  it("includes explicitly shared first-party analytics using the existing public projection", async () => {
    const view = await getPublicCreatorView(
      fixture({ publicDemographicsEnabled: true }),
    );
    expect(queries.analytics).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { creatorProfileId: "creator-1" },
        select: { platform: true, ageGenderData: true, countryData: true },
      }),
    );
    expect(view.profile.demographicAnalytics).toEqual(
      await queries.analytics.mock.results[0]!.value,
    );
  });
  it("preserves follower aggregation, missing values, avatar precedence and saved widget IDs", async () => {
    const view = await getPublicCreatorView(
      fixture({ customAvatarUrl: "https://static-cdn.jtvnw.net/custom.png" }),
    );
    expect(view.headerData.platformAccounts[0]?.followerCount).toBe("125");
    expect(view.headerData.primaryGameName).toBeNull();
    expect(view.headerData.lastStreamAt).toBeNull();
    expect(view.profile.totalFollowers).toBe("125");
    expect(view.profile.widgetConfig).toEqual(["stats_row", "demographics"]);
    expect(view.headerData.avatarUrl).toBe(
      "https://static-cdn.jtvnw.net/custom.png",
    );
    const sparse = await getPublicCreatorView(
      fixture({ platformAccounts: [] }),
    );
    expect(sparse.headerData.lastSnapshotAt).toBeNull();
    expect(sparse.headerData.platformAccounts).toEqual([]);
  });
});
