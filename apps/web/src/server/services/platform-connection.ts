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
  });

  if (existingPlatformAccount) {
    const updated = await prisma.platformAccount.update({
      where: { id: existingPlatformAccount.id },
      data: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        oauthScopes,
        isOAuthConnected: true,
        lastOAuthRefresh: new Date(),
      },
    });

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

  return {
    platformAccount: created,
    isNewConnection: true,
    matchedCreatorProfile: false,
  };
}
