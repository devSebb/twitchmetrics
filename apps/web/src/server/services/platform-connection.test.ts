import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted above the imports below) ---
vi.mock("@twitchmetrics/database", () => ({
  prisma: {
    platformAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    creatorProfile: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/encryption", () => ({
  encryptToken: vi.fn(async (t: string) => `enc:${t}`),
}));
vi.mock("./youtube-channel", () => ({
  getYouTubeChannelId: vi.fn(async () => null),
}));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { prisma } from "@twitchmetrics/database";
import { connectPlatform, parseOAuthScopes } from "./platform-connection";

type MockFn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  platformAccount: {
    findUnique: MockFn;
    update: MockFn;
    updateMany: MockFn;
    create: MockFn;
    deleteMany: MockFn;
  };
  creatorProfile: { findUnique: MockFn; update: MockFn; create: MockFn };
  $transaction: MockFn;
};

describe("parseOAuthScopes", () => {
  it("parses space-separated OAuth scopes", () => {
    expect(parseOAuthScopes("openid email profile")).toEqual([
      "openid",
      "email",
      "profile",
    ]);
  });

  it("parses TikTok comma-separated OAuth scopes", () => {
    expect(
      parseOAuthScopes("user.info.basic,user.info.profile,video.list"),
    ).toEqual(["user.info.basic", "user.info.profile", "video.list"]);
  });

  it("ignores repeated delimiters and blank values", () => {
    expect(parseOAuthScopes(" user.info.basic,  video.list ")).toEqual([
      "user.info.basic",
      "video.list",
    ]);
  });
});

describe("connectPlatform — link-only (discoverySource) upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Run the transaction callback against the mocked prisma directly.
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
  });

  const baseInput = {
    userId: "user-1",
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: null,
    scope: null,
  };

  it("clears discoverySource when OAuth-connecting an existing link-only account", async () => {
    // The same platform user is already present as a link-only social account.
    db.platformAccount.findUnique.mockResolvedValue({
      id: "acc-link",
      creatorProfileId: "cp-1",
      platformUsername: "old",
      discoverySource: "sh-social",
      creatorProfile: { id: "cp-1", userId: null },
    });
    db.creatorProfile.findUnique.mockResolvedValue(null); // no separate user profile
    db.platformAccount.update.mockResolvedValue({
      id: "acc-link",
      creatorProfileId: "cp-1",
    });

    await connectPlatform({
      ...baseInput,
      provider: "twitch",
      providerAccountId: "12345",
      profile: { login: "foo" },
    });

    expect(db.platformAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-link" },
        data: expect.objectContaining({
          isOAuthConnected: true,
          discoverySource: null, // <- the fix: upgrade out of link-only state
        }),
      }),
    );
    expect(db.creatorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cp-1" },
        data: expect.objectContaining({ listed: true }),
      }),
    );
  });

  it("retires a link-only placeholder squatting the platform slot before creating the real account", async () => {
    // No existing row for this (platform, platformUserId), so we hit the create
    // path — but the creator already owns a link-only account for this platform.
    db.platformAccount.findUnique.mockResolvedValue(null);
    db.creatorProfile.findUnique.mockResolvedValue({
      id: "cp-2",
      displayName: "Creator",
      slug: "creator",
    });
    db.platformAccount.deleteMany.mockResolvedValue({ count: 1 });
    db.platformAccount.create.mockResolvedValue({
      id: "acc-real",
      creatorProfileId: "cp-2",
    });

    await connectPlatform({
      ...baseInput,
      userId: "user-2",
      provider: "instagram",
      providerAccountId: "999",
      profile: { username: "real_handle" },
    });

    expect(db.platformAccount.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          creatorProfileId: "cp-2",
          platform: "instagram",
          discoverySource: { not: null },
        }),
      }),
    );
    expect(db.platformAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creatorProfileId: "cp-2",
          platform: "instagram",
          isOAuthConnected: true,
        }),
      }),
    );
    expect(db.creatorProfile.update).toHaveBeenCalledWith({
      where: { id: "cp-2" },
      data: { listed: true },
    });
  });

  it("turns a replaced user placeholder into a redirect stub", async () => {
    db.platformAccount.findUnique.mockResolvedValue({
      id: "catalog-account",
      creatorProfileId: "catalog-profile",
      platformUsername: "creator",
      discoverySource: null,
      creatorProfile: { id: "catalog-profile", userId: null },
    });
    db.creatorProfile.findUnique.mockResolvedValue({
      id: "user-placeholder",
    });
    db.platformAccount.update.mockResolvedValue({
      id: "catalog-account",
      creatorProfileId: "catalog-profile",
    });

    await connectPlatform({
      ...baseInput,
      provider: "twitch",
      providerAccountId: "12345",
      profile: { login: "creator" },
    });

    expect(db.creatorProfile.update).toHaveBeenCalledWith({
      where: { id: "user-placeholder" },
      data: {
        userId: null,
        state: "unclaimed",
        claimedAt: null,
        listed: false,
        mergedIntoId: "catalog-profile",
      },
    });
  });
});
