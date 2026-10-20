import type { Platform, Prisma } from "@twitchmetrics/database";

// Maps a creator's internal platform accounts onto StreamHatchet's platform
// codes + channel ids. Shared by the snapshot router (widget data) and the
// profile layout's data-availability checks so both agree on what exists.

export type StreamHatchetAccount = {
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
};

export type StreamHatchetPlatform = "kick" | "twitch" | "yt" | "ytg";

export const STREAMHATCHET_SUPPORTED_PLATFORMS: Platform[] = [
  "kick",
  "twitch",
  "youtube",
];

export function streamHatchetPlatforms(
  platform: Platform,
): StreamHatchetPlatform[] {
  switch (platform) {
    case "kick":
      return ["kick"];
    case "twitch":
      return ["twitch"];
    case "youtube":
      return ["yt", "ytg"];
    default:
      return [];
  }
}

export function internalPlatformForStreamHatchet(
  platform: string,
): Platform | null {
  switch (platform) {
    case "kick":
      return "kick";
    case "twitch":
      return "twitch";
    case "yt":
    case "ytg":
      return "youtube";
    default:
      return null;
  }
}

export async function getStreamHatchetAccounts(
  prisma: {
    platformAccount: {
      findMany: (args: {
        where: {
          creatorProfileId: string;
          platform: { in: Platform[] };
        };
        select: {
          platform: true;
          platformUserId: true;
          platformUsername: true;
        };
      }) => Promise<StreamHatchetAccount[]>;
    };
  },
  creatorProfileId: string,
): Promise<StreamHatchetAccount[]> {
  return prisma.platformAccount.findMany({
    where: {
      creatorProfileId,
      platform: { in: STREAMHATCHET_SUPPORTED_PLATFORMS },
    },
    select: {
      platform: true,
      platformUserId: true,
      platformUsername: true,
    },
  });
}

export function streamHatchetIdentityWhere(
  accounts: StreamHatchetAccount[],
): Prisma.StreamSessionFactWhereInput[] {
  return accounts.flatMap((account) => {
    const platforms = streamHatchetPlatforms(account.platform);
    if (platforms.length === 0) return [];

    const identity: Prisma.StreamSessionFactWhereInput[] = [
      { platformUserId: account.platformUserId },
    ];

    return platforms.map((platform) => ({ platform, OR: identity }));
  });
}

export function streamHatchetRollupIdentityWhere(
  accounts: StreamHatchetAccount[],
): Prisma.ChannelDailyRollupWhereInput[] {
  return accounts.flatMap((account) => {
    const platforms = streamHatchetPlatforms(account.platform);
    if (platforms.length === 0) return [];

    const identity: Prisma.ChannelDailyRollupWhereInput[] = [
      { platformUserId: account.platformUserId },
    ];

    return platforms.map((platform) => ({ platform, OR: identity }));
  });
}
