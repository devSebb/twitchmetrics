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

type PlatformIdentity = {
  username: string | null;
  displayName: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
};

export function parseOAuthScopes(scope: string | null): string[] {
  if (!scope) {
    return [];
  }

  return scope
    .split(/[,\s]+/)
    .map((scopeValue) => scopeValue.trim())
    .filter((scopeValue) => scopeValue.length > 0);
}

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
  kick: "kick",
};

function getStringProperty(value: unknown, property: string): string | null {
  if (!value || typeof value !== "object" || !(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" && propertyValue.length > 0
    ? propertyValue
    : null;
}

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

function resolvePlatformIdentity(
  input: ConnectPlatformInput,
  platform: Platform,
  platformUserId: string,
): PlatformIdentity {
  if (platform === "twitch") {
    const username =
      getStringProperty(input.profile, "preferred_username") ??
      getStringProperty(input.profile, "login") ??
      getStringProperty(input.profile, "username");
    const displayName =
      getStringProperty(input.profile, "name") ??
      getStringProperty(input.profile, "display_name") ??
      username;
    const avatarUrl = getStringProperty(input.profile, "picture");

    return {
      username,
      displayName,
      profileUrl: username ? `https://twitch.tv/${username}` : null,
      avatarUrl,
    };
  }

  if (
    platform === "x" &&
    input.profile &&
    typeof input.profile === "object" &&
    "data" in input.profile
  ) {
    const data = (input.profile as { data?: unknown }).data;
    const username = getStringProperty(data, "username");

    return {
      username,
      displayName: getStringProperty(data, "name") ?? username,
      profileUrl: username ? `https://x.com/${username}` : null,
      avatarUrl: getStringProperty(data, "profile_image_url"),
    };
  }

  if (platform === "kick") {
    const username = getStringProperty(input.profile, "name");
    const avatarUrl = getStringProperty(input.profile, "profile_picture");

    return {
      username,
      displayName: username,
      profileUrl: username ? `https://kick.com/${username}` : null,
      avatarUrl,
    };
  }

  if (platform === "tiktok") {
    const username = getStringProperty(input.profile, "username");
    const displayName = getStringProperty(input.profile, "display_name");
    const avatarUrl = getStringProperty(input.profile, "avatar_url");
    const profileDeepLink = getStringProperty(
      input.profile,
      "profile_deep_link",
    );

    return {
      username,
      displayName: displayName ?? username,
      profileUrl:
        profileDeepLink ??
        (username ? `https://www.tiktok.com/@${username}` : null),
      avatarUrl,
    };
  }

  return {
    username: platformUserId,
    displayName: null,
    profileUrl: null,
    avatarUrl: null,
  };
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

  const identity = resolvePlatformIdentity(input, platform, platformUserId);
  const encryptedAccessToken = input.accessToken
    ? await encryptToken(input.accessToken)
    : null;
  const encryptedRefreshToken = input.refreshToken
    ? await encryptToken(input.refreshToken)
    : null;
  const oauthScopes = parseOAuthScopes(input.scope);
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

    const updated = await prisma.$transaction(async (tx) => {
      if (shouldMoveToUserProfile) {
        // Prefer the pre-discovered canonical profile for this platform user.
        // The old user placeholder is detached so the canonical profile can own
        // the app user and keep its public slug/search history.
        await tx.platformAccount.updateMany({
          where: {
            creatorProfileId: userProfile.id,
            platform: { not: platform },
          },
          data: { creatorProfileId: existingPlatformAccount.creatorProfileId },
        });

        await tx.creatorProfile.update({
          where: { id: userProfile.id },
          data: {
            userId: null,
            state: "unclaimed",
            claimedAt: null,
          },
        });
      }

      if (!existingPlatformAccount.creatorProfile.userId) {
        await tx.creatorProfile.update({
          where: { id: existingPlatformAccount.creatorProfileId },
          data: {
            userId: input.userId,
            state: "claimed",
            claimedAt: new Date(),
          },
        });
      }

      return tx.platformAccount.update({
        where: { id: existingPlatformAccount.id },
        data: {
          platformUsername:
            identity.username ?? existingPlatformAccount.platformUsername,
          ...(identity.displayName
            ? { platformDisplayName: identity.displayName }
            : {}),
          ...(identity.profileUrl ? { platformUrl: identity.profileUrl } : {}),
          ...(identity.avatarUrl
            ? { platformAvatarUrl: identity.avatarUrl }
            : {}),
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          oauthScopes,
          isOAuthConnected: true,
          lastOAuthRefresh: new Date(),
        },
      });
    });

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
      platformUsername: identity.username ?? platformUserId,
      platformDisplayName: identity.displayName,
      platformUrl: identity.profileUrl,
      platformAvatarUrl: identity.avatarUrl,
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
