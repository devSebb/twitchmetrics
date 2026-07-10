import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { resolveAvatar } from "@/lib/avatar";
import { CreatorHeader } from "@/components/creator";
import { DashboardGrid, type SerializedProfile } from "@/components/dashboard";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const getCreator = cache(async (slug: string) => {
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
          totalViews: true,
          postCount: true,
          lastSyncedAt: true,
          isOAuthConnected: true,
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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const creator = await getCreator(slug);

  if (!creator) {
    return { title: "Creator Not Found | TwitchMetrics" };
  }

  const platformNames = creator.platformAccounts
    .map((a) => PLATFORM_CONFIG[a.platform].name)
    .join(", ");

  const totalFollowers = Number(creator.totalFollowers);
  const followersStr =
    totalFollowers >= 1_000_000
      ? `${(totalFollowers / 1_000_000).toFixed(1)}M`
      : totalFollowers >= 1_000
        ? `${(totalFollowers / 1_000).toFixed(0)}K`
        : `${totalFollowers}`;

  const description = `View ${creator.displayName}'s streaming analytics across ${platformNames}. ${followersStr} total followers.`;
  const avatarUrl = resolveAvatar("creator", {
    creator: {
      avatarUrl: creator.avatarUrl,
      customAvatarUrl: creator.customAvatarUrl,
    },
  });

  return {
    title: `${creator.displayName} - Creator Analytics`,
    description,
    openGraph: {
      title: `${creator.displayName} | ${SITE_NAME}`,
      description: `${followersStr} total followers across ${platformNames}`,
      images: avatarUrl
        ? [
            {
              url: avatarUrl,
              width: 300,
              height: 300,
              alt: creator.displayName,
            },
          ]
        : [],
      type: "profile",
      url: `${SITE_URL}/creator/${slug}`,
    },
    twitter: {
      card: "summary",
      site: TWITTER_HANDLE,
      title: `${creator.displayName} | ${SITE_NAME}`,
      description: `${followersStr} total followers across ${platformNames}`,
      images: avatarUrl ? [avatarUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/creator/${slug}`,
    },
  };
}

export default async function CreatorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const creator = await getCreator(slug);

  if (!creator) {
    notFound();
  }

  // Merged profiles are redirect stubs — send old links to the canonical slug.
  if (creator.mergedInto) {
    redirect(`/creator/${creator.mergedInto.slug}`);
  }

  const isClaimed = creator.state === "claimed" || creator.state === "premium";
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
    lastSnapshotAt: creator.lastSnapshotAt
      ? String(creator.lastSnapshotAt)
      : null,
    platformAccounts: creator.platformAccounts.map((a) => ({
      platform: a.platform,
      platformUsername: a.platformUsername,
      platformUrl: a.platformUrl,
      followerCount: a.followerCount ? String(a.followerCount) : null,
      totalViews: a.totalViews ? String(a.totalViews) : null,
      postCount: a.postCount ?? null,
    })),
    growthRollups: creator.growthRollups.map((g) => ({
      platform: g.platform,
      delta7d: String(g.delta7d),
      pct7d: g.pct7d,
      trendDirection: g.trendDirection,
    })),
  };

  const demographicAnalytics = creator.publicDemographicsEnabled
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

  // Data for DashboardGrid (same shape as dashboard page)
  const serialized = {
    ...(serializeBigInt(creator) as Record<string, unknown>),
    demographicAnalytics: serializeBigInt(demographicAnalytics),
  } as unknown as SerializedProfile;

  // Person JSON-LD for rich results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: creator.displayName,
    url: `${SITE_URL}/creator/${creator.slug}`,
    image: avatarUrl ?? undefined,
    description: creator.bio ?? undefined,
    sameAs: creator.platformAccounts
      .map((a: { platformUrl: string | null }) => a.platformUrl)
      .filter((url): url is string => url !== null),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/FollowAction",
      userInteractionCount: Number(creator.totalFollowers),
    },
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CreatorHeader creator={headerData} />
      <DashboardGrid
        profile={serialized}
        widgetConfig={creator.widgetConfig}
        isClaimed={isClaimed}
        isOwner={false}
      />
    </div>
  );
}
