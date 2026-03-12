import {
  Prisma,
  prisma,
  type Platform,
  type ProfileState,
} from "@twitchmetrics/database";
import { decryptToken } from "@/lib/encryption";
import { createLogger } from "@/lib/logger";
import { fetchInstagramInsights } from "@/server/services/enrichment/instagram-insights";
import {
  EnrichmentRateLimitError,
  OAuthTokenInvalidError,
} from "@/server/services/enrichment/errors";
import { fetchTwitchSubscriberData } from "@/server/services/enrichment/twitch-authenticated";
import { fetchYouTubeAnalytics } from "@/server/services/enrichment/youtube-analytics";

const log = createLogger("creator-enrichment");

const ENRICHABLE_STATES: ProfileState[] = ["claimed", "premium"];

type ClaimedProfile = {
  id: string;
  userId: string | null;
  state: ProfileState;
  platformAccounts: Array<{
    id: string;
    platform: Platform;
    platformUserId: string;
    accessToken: string | null;
    isOAuthConnected: boolean;
  }>;
};

function toUtcDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function getRollingPeriod(): { periodStart: Date; periodEnd: Date } {
  const periodEnd = toUtcDateOnly(new Date());
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 30);
  return { periodStart, periodEnd };
}

export async function fetchClaimedProfilesForEnrichment(
  creatorProfileId?: string,
): Promise<ClaimedProfile[]> {
  return prisma.creatorProfile.findMany({
    where: {
      ...(creatorProfileId ? { id: creatorProfileId } : {}),
      state: { in: ENRICHABLE_STATES },
      platformAccounts: {
        some: {
          isOAuthConnected: true,
          accessToken: { not: null },
        },
      },
    },
    select: {
      id: true,
      userId: true,
      state: true,
      platformAccounts: {
        where: {
          isOAuthConnected: true,
          accessToken: { not: null },
        },
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          accessToken: true,
          isOAuthConnected: true,
        },
      },
    },
  });
}

function toBigInt(value: number): bigint {
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
  return BigInt(normalized);
}

function jsonOrNull(
  value: Record<string, number> | Record<string, Record<string, number>> | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value;
}

export async function enrichSinglePlatformAccount(input: {
  creatorProfileId: string;
  platformAccountId: string;
  platform: Platform;
  platformUserId: string;
  encryptedAccessToken: string;
}): Promise<void> {
  const { periodStart, periodEnd } = getRollingPeriod();

  try {
    const decryptedAccessToken = await decryptToken(input.encryptedAccessToken);
    const fetchedAt = new Date();

    if (input.platform === "youtube") {
      const result = await fetchYouTubeAnalytics(
        decryptedAccessToken,
        input.platformUserId,
        periodStart,
        periodEnd,
      );
      await prisma.creatorAnalytics.upsert({
        where: {
          creatorProfileId_platform_periodStart: {
            creatorProfileId: input.creatorProfileId,
            platform: input.platform,
            periodStart,
          },
        },
        create: {
          creatorProfileId: input.creatorProfileId,
          platform: input.platform,
          periodStart,
          periodEnd,
          fetchedAt,
          estimatedMinutesWatched: toBigInt(result.estimatedMinutesWatched),
          averageViewDuration: result.averageViewDuration,
          subscribersGained: result.subscribersGained,
          subscribersLost: result.subscribersLost,
          estimatedRevenue: result.estimatedRevenue,
          views: toBigInt(result.views),
          likes: result.likes,
          comments: result.comments,
          shares: result.shares,
          ageGenderData: jsonOrNull(result.ageGenderData),
          countryData: jsonOrNull(result.countryData),
          deviceData: jsonOrNull(result.deviceData),
          trafficSources: jsonOrNull(result.trafficSources),
        },
        update: {
          periodEnd,
          fetchedAt,
          estimatedMinutesWatched: toBigInt(result.estimatedMinutesWatched),
          averageViewDuration: result.averageViewDuration,
          subscribersGained: result.subscribersGained,
          subscribersLost: result.subscribersLost,
          estimatedRevenue: result.estimatedRevenue,
          views: toBigInt(result.views),
          likes: result.likes,
          comments: result.comments,
          shares: result.shares,
          ageGenderData: jsonOrNull(result.ageGenderData),
          countryData: jsonOrNull(result.countryData),
          deviceData: jsonOrNull(result.deviceData),
          trafficSources: jsonOrNull(result.trafficSources),
        },
      });
    } else if (input.platform === "instagram") {
      const result = await fetchInstagramInsights(
        decryptedAccessToken,
        input.platformUserId,
      );
      await prisma.creatorAnalytics.upsert({
        where: {
          creatorProfileId_platform_periodStart: {
            creatorProfileId: input.creatorProfileId,
            platform: input.platform,
            periodStart,
          },
        },
        create: {
          creatorProfileId: input.creatorProfileId,
          platform: input.platform,
          periodStart,
          periodEnd,
          fetchedAt,
          impressions: toBigInt(result.impressions),
          reach: toBigInt(result.reach),
          profileViews: result.profileViews,
          websiteClicks: result.websiteClicks,
          ageGenderData: jsonOrNull(result.ageGenderData),
          countryData: jsonOrNull(result.countryData),
        },
        update: {
          periodEnd,
          fetchedAt,
          impressions: toBigInt(result.impressions),
          reach: toBigInt(result.reach),
          profileViews: result.profileViews,
          websiteClicks: result.websiteClicks,
          ageGenderData: jsonOrNull(result.ageGenderData),
          countryData: jsonOrNull(result.countryData),
        },
      });
    } else if (input.platform === "twitch") {
      const result = await fetchTwitchSubscriberData(
        decryptedAccessToken,
        input.platformUserId,
      );
      await prisma.creatorAnalytics.upsert({
        where: {
          creatorProfileId_platform_periodStart: {
            creatorProfileId: input.creatorProfileId,
            platform: input.platform,
            periodStart,
          },
        },
        create: {
          creatorProfileId: input.creatorProfileId,
          platform: input.platform,
          periodStart,
          periodEnd,
          fetchedAt,
          subscriberCount: result.subscriberCount,
          subscriberPoints: result.subscriberPoints,
        },
        update: {
          periodEnd,
          fetchedAt,
          subscriberCount: result.subscriberCount,
          subscriberPoints: result.subscriberPoints,
        },
      });
    }
  } catch (error) {
    if (error instanceof OAuthTokenInvalidError) {
      await prisma.platformAccount.update({
        where: { id: input.platformAccountId },
        data: {
          isOAuthConnected: false,
        },
      });
      log.warn(
        {
          creatorProfileId: input.creatorProfileId,
          platformAccountId: input.platformAccountId,
          platform: input.platform,
        },
        "Disconnected OAuth account after auth failure during enrichment",
      );
      return;
    }

    if (error instanceof EnrichmentRateLimitError) {
      throw error;
    }

    log.error(
      {
        err: error,
        creatorProfileId: input.creatorProfileId,
        platformAccountId: input.platformAccountId,
        platform: input.platform,
      },
      "Failed platform enrichment run",
    );
  }
}
