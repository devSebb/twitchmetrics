import {
  prisma,
  type Platform,
  type PlatformAccount,
} from "@twitchmetrics/database";
import { encryptToken } from "@/lib/encryption";
import { getYouTubeChannelId } from "./youtube-channel";

type ConnectPlatformInput = {
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string | null;
  profile?: unknown;
};

export type ConnectPlatformResult = {
  platformAccount: PlatformAccount;
  isNewConnection: boolean;
  matchedCreatorProfile: boolean;
};

const PROVIDER_PLATFORM_MAP: Record<string, Platform> = {
  twitch: "twitch",
  google: "youtube",
  twitter: "x",
  instagram: "instagram",
  tiktok: "tiktok",
};

async function resolvePlatformUserId(
  input: ConnectPlatformInput,
  platform: Platform,
): Promise<string | null> {
  if (platform === "youtube") {
    if (!input.accessToken) return null;
    const channelId = await getYouTubeChannelId(input.accessToken);
    return channelId;
  }

  if (platform === "twitch") {
    if (
      input.profile &&
      typeof input.profile === "object" &&
      "sub" in input.profile &&
      typeof input.profile.sub === "string"
    ) {
      return input.profile.sub;
    }
  }

  if (platform === "x") {
    if (
      input.profile &&
      typeof input.profile === "object" &&
      "data" in input.profile &&
      input.profile.data &&
      typeof input.profile.data === "object" &&
      "id" in input.profile.data &&
      typeof input.profile.data.id === "string"
    ) {
      return input.profile.data.id;
    }
  }

  return input.providerAccountId || null;
}

export async function connectPlatform(
  input: ConnectPlatformInput,
): Promise<ConnectPlatformResult | null> {
  const platform = PROVIDER_PLATFORM_MAP[input.provider];
  if (!platform) {
    return null;
  }

  const platformUserId = await resolvePlatformUserId(input, platform);
  if (!platformUserId) {
    return null;
  }

  const encryptedAccessToken = input.accessToken
    ? await encryptToken(input.accessToken)
    : null;
  const encryptedRefreshToken = input.refreshToken
    ? await encryptToken(input.refreshToken)
    : null;
  const oauthScopes = input.scope
    ? input.scope.split(" ").filter((scopeValue) => scopeValue.length > 0)
    : [];
  const tokenExpiresAt = input.expiresAt
    ? new Date(input.expiresAt * 1000)
    : null;

  const existingPlatformAccount = await prisma.platformAccount.findUnique({
    where: {
      platform_platformUserId: {
        platform,
        platformUserId,
      },
    },
    include: {
      creatorProfile: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (existingPlatformAccount) {
    const userProfile = await prisma.creatorProfile.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });

    if (
      existingPlatformAccount.creatorProfile.userId &&
      existingPlatformAccount.creatorProfile.userId !== input.userId
    ) {
      throw new Error(
        `${platform} account is already linked to another creator profile`,
      );
    }

    const shouldMoveToUserProfile =
      !existingPlatformAccount.creatorProfile.userId &&
      userProfile &&
      userProfile.id !== existingPlatformAccount.creatorProfileId;

    const updated = await prisma.platformAccount.update({
      where: { id: existingPlatformAccount.id },
      data: {
        ...(shouldMoveToUserProfile
          ? { creatorProfileId: userProfile.id }
          : {}),
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        oauthScopes,
        isOAuthConnected: true,
        lastOAuthRefresh: new Date(),
      },
    });

    if (!existingPlatformAccount.creatorProfile.userId && !userProfile) {
      await prisma.creatorProfile.update({
        where: { id: existingPlatformAccount.creatorProfileId },
        data: {
          userId: input.userId,
          state: "claimed",
          claimedAt: new Date(),
        },
      });
    }

    // Fire snapshot event on reconnect (user explicitly triggered OAuth)
    try {
      const { inngest } = await import("@/inngest/client");
      void inngest.send({
        name: "creator/platform.connected",
        data: {
          creatorProfileId: updated.creatorProfileId,
          platform,
          platformUserId,
          platformAccountId: existingPlatformAccount.id,
        },
      });
    } catch {
      // Non-blocking — never fail auth for a background job
    }

    return {
      platformAccount: updated,
      isNewConnection: false,
      matchedCreatorProfile: true,
    };
  }

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true, displayName: true, slug: true },
  });

  const ensuredCreatorProfile =
    creatorProfile ??
    (await prisma.creatorProfile.create({
      data: {
        userId: input.userId,
        displayName: "My Creator Profile",
        slug: `user-${input.userId}`,
        primaryPlatform: platform,
        state: "claimed",
        claimedAt: new Date(),
      },
    }));

  const created = await prisma.platformAccount.create({
    data: {
      creatorProfileId: ensuredCreatorProfile.id,
      platform,
      platformUserId,
      platformUsername: platformUserId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt,
      oauthScopes,
      isOAuthConnected: true,
      lastOAuthRefresh: new Date(),
    },
  });

  // Fire snapshot event so the dashboard is populated immediately rather than
  // waiting for the next scheduled tier cron (which could be up to a week away).
  try {
    const { inngest } = await import("@/inngest/client");
    void inngest.send({
      name: "creator/platform.connected",
      data: {
        creatorProfileId: ensuredCreatorProfile.id,
        platform,
        platformUserId,
        platformAccountId: created.id,
      },
    });
  } catch {
    // Non-blocking — never fail auth for a background job
  }

  return {
    platformAccount: created,
    isNewConnection: true,
    matchedCreatorProfile: false,
  };
}
