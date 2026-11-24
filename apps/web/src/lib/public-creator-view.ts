import { cache } from "react";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { resolveAvatar } from "@/lib/avatar";
import {
  getLatestTimestamp,
  selectDisplayableDemographics,
} from "@/lib/metric-freshness";
import { isKnownGrowthRollup } from "@/server/services/creator-growth";
import { getProfileDataAvailability } from "@/server/services/profile-widget-availability";
import { getStatsContext } from "@/server/services/creator-streaming-stats";
import { platformFollowerCount } from "@/lib/platform-follower-count";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

export const getPublicCreator = cache(async (slug: string) => {
  const creator = await db.creatorProfile.findUnique({
    where: { slug },
    include: {
      mergedInto: { select: { slug: true } },
      platformAccounts: {
        select: {
          platform: true,
          platformUsername: true,
          platformUrl: true,
          followerCount: true,
          otherChannelsFollowerCount: true,
          totalViews: true,
          postCount: true,
          lastSyncedAt: true,
          isOAuthConnected: true,
          discoverySource: true,
        },
      },
      growthRollups: {
        select: {
          platform: true,
          followerCount: true,
          delta1d: true,
          delta7d: true,
          delta30d: true,
          pct1d: true,
          pct7d: true,
          pct30d: true,
          trendDirection: true,
          acceleration: true,
          computedAt: true,
        },
        orderBy: { computedAt: "desc" },
      },
      brandPartnerships: {
        where: { isPublic: true },
        select: {
          id: true,
          brandName: true,
          brandLogoUrl: true,
          campaignName: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!creator) return null;
  return creator;
});

export type PublicCreator = NonNullable<
  Awaited<ReturnType<typeof getPublicCreator>>
>;

/** Public presentation payload shared by the analytical profile and media kit.
 * Never send the raw database profile or private owner analytics to a client. */
export async function getPublicCreatorView(creator: PublicCreator) {
  const isClaimed = creator.state === "claimed" || creator.state === "premium";
  const lastUpdatedAt = getLatestTimestamp(
    creator.platformAccounts.map((account) => account.lastSyncedAt),
  );
  const avatarUrl = resolveAvatar("creator", {
    creator: {
      avatarUrl: creator.avatarUrl,
      customAvatarUrl: creator.customAvatarUrl,
    },
  });

  // Data for CreatorHeader (card-style profile)
  const headerData = {
    id: creator.id,
    displayName: creator.displayName,
    slug: creator.slug,
    avatarUrl,
    bannerUrl: creator.bannerUrl,
    bio: creator.bio,
    country: creator.country,
    language: creator.language,
    age: creator.age,
    state: creator.state,
    primaryPlatform: creator.primaryPlatform,
    totalFollowers: String(creator.totalFollowers),
    lastSnapshotAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
    platformAccounts: creator.platformAccounts.map((a) => ({
      platform: a.platform,
      platformUsername: a.platformUsername,
      platformUrl: a.platformUrl,
      followerCount: platformFollowerCount(a)?.toString() ?? null,
      totalViews: a.totalViews ? String(a.totalViews) : null,
      postCount: a.postCount ?? null,
    })),
    growthRollups: creator.growthRollups
      .filter(isKnownGrowthRollup)
      .map((g) => ({
        platform: g.platform,
        delta7d: String(g.delta7d),
        pct7d: g.pct7d,
        trendDirection: g.trendDirection,
      })),
  };

  // Which client-loaded widgets have data, so the grid packs only cards that
  // will render. Started here to run alongside the demographics queries.
  const dataAvailabilityPromise = getProfileDataAvailability(db, creator);
  // The Stats Row's opening period (the shortest one with streams).
  const statsContextPromise = getStatsContext(db, creator.id);

  const demographicAnalytics =
    isClaimed && creator.publicDemographicsEnabled
      ? await db.creatorAnalytics.findMany({
          where: { creatorProfileId: creator.id },
          orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
          select: {
            platform: true,
            ageGenderData: true,
            countryData: true,
          },
          take: 10,
        })
      : [];

  // Third-party social-audience estimates are public data (same category as
  // follower counts) — fetched for every profile, no visibility flag. The
  // widget prefers first-party analytics when both exist. Newest report
  // first; reports too old to show are dropped and stale ones tagged.
  const audienceDemographics = selectDisplayableDemographics(
    (
      await db.audienceDemographics.findMany({
        where: { creatorProfileId: creator.id },
        orderBy: { dpUpdatedAt: { sort: "desc", nulls: "last" } },
        select: {
          platform: true,
          ages: true,
          genders: true,
          countries: true,
          income: true,
          reach: true,
          dpUpdatedAt: true,
        },
      })
    ).map((row) => ({
      ...row,
      reach: row.reach != null ? String(row.reach) : null,
      dpUpdatedAt: row.dpUpdatedAt ? row.dpUpdatedAt.toISOString() : null,
    })),
  );

  const [dataAvailability, statsContext] = await Promise.all([
    dataAvailabilityPromise,
    statsContextPromise,
  ]);

  // Data for DashboardGrid (same shape as dashboard page)
  const serialized = {
    id: creator.id,
    displayName: creator.displayName,
    slug: creator.slug,
    avatarUrl,
    customAvatarUrl: creator.customAvatarUrl,
    bio: creator.bio,
    country: creator.country,
    language: creator.language,
    gender: creator.gender,
    age: creator.age,
    interests: creator.interests,
    primaryPlatform: creator.primaryPlatform,
    totalFollowers: String(creator.totalFollowers),
    totalViews: String(creator.totalViews),
    widgetConfig: creator.widgetConfig,
    publicDemographicsEnabled: creator.publicDemographicsEnabled,
    platformAccounts: serializeBigInt(creator.platformAccounts),
    growthRollups: serializeBigInt(creator.growthRollups),
    brandPartnerships: serializeBigInt(creator.brandPartnerships),
    demographicAnalytics: serializeBigInt(demographicAnalytics),
    audienceDemographics,
  } as unknown as SerializedProfile;

  return {
    headerData,
    profile: serialized,
    isClaimed,
    dataAvailability,
    statsContext,
  };
}
