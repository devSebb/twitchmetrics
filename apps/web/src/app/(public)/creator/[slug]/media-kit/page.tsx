import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { MediaKitLayout } from "@/components/media-kit/MediaKitLayout";

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function getMediaKitData(slug: string) {
  const profile = await db.creatorProfile.findUnique({
    where: { slug },
    include: {
      platformAccounts: {
        select: {
          platform: true,
          platformUsername: true,
          platformUrl: true,
          followerCount: true,
          totalViews: true,
        },
      },
      growthRollups: {
        select: {
          platform: true,
          followerCount: true,
          delta30d: true,
          pct30d: true,
          trendDirection: true,
        },
      },
      brandPartnerships: {
        where: { isPublic: true },
        select: {
          brandName: true,
          brandLogoUrl: true,
          campaignName: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!profile) return null;
  return serializeBigInt(profile);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getMediaKitData(slug);

  if (!profile) {
    return { title: "Media Kit Not Found | TwitchMetrics" };
  }

  const totalFollowers = Number(profile.totalFollowers);
  const followersStr =
    totalFollowers >= 1_000_000
      ? `${(totalFollowers / 1_000_000).toFixed(1)}M`
      : totalFollowers >= 1_000
        ? `${(totalFollowers / 1_000).toFixed(0)}K`
        : `${totalFollowers}`;

  const platformNames = profile.platformAccounts
    .map((a) => PLATFORM_CONFIG[a.platform].name)
    .join(", ");

  const description =
    profile.bio ??
    `${profile.displayName}'s creator media kit with verified analytics across ${platformNames}.`;

  return {
    title: `${profile.displayName} — Media Kit | ${SITE_NAME}`,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title: `${profile.displayName} — Media Kit`,
      description: `${followersStr} followers across ${platformNames}`,
      images: profile.avatarUrl
        ? [
            {
              url: profile.avatarUrl,
              width: 300,
              height: 300,
              alt: profile.displayName,
            },
          ]
        : [],
      type: "profile",
      url: `${SITE_URL}/creator/${slug}/media-kit`,
    },
    twitter: {
      card: "summary",
      site: TWITTER_HANDLE,
      title: `${profile.displayName} — Media Kit | ${SITE_NAME}`,
      description: `${followersStr} followers across ${platformNames}`,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/creator/${slug}/media-kit`,
    },
  };
}

export default async function MediaKitPage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await getMediaKitData(slug);

  if (!profile) notFound();

  const isClaimed = profile.state === "claimed" || profile.state === "premium";

  const analytics = isClaimed
    ? await db.creatorAnalytics.findFirst({
        where: { creatorProfileId: profile.id },
        orderBy: { periodEnd: "desc" },
        select: { ageGenderData: true, countryData: true },
      })
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.displayName,
    description: profile.bio ?? undefined,
    image: profile.avatarUrl ?? undefined,
    url: `${SITE_URL}/creator/${profile.slug}`,
    sameAs: profile.platformAccounts
      .map((a) => a.platformUrl)
      .filter((url): url is string => url !== null),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/FollowAction",
      userInteractionCount: Number(profile.totalFollowers),
    },
  };

  const profileData = {
    displayName: profile.displayName,
    slug: profile.slug,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    bio: profile.bio,
    country: profile.country,
    state: profile.state,
    totalFollowers: String(profile.totalFollowers),
    totalViews: String(profile.totalViews),
    platformAccounts: profile.platformAccounts.map((a) => ({
      platform: a.platform,
      platformUsername: a.platformUsername,
      platformUrl: a.platformUrl,
      followerCount: a.followerCount ? String(a.followerCount) : "0",
      totalViews: a.totalViews ? String(a.totalViews) : "0",
    })),
    growthRollups: profile.growthRollups.map((g) => ({
      platform: g.platform,
      followerCount: String(g.followerCount),
      delta30d: String(g.delta30d),
      pct30d: g.pct30d,
      trendDirection: g.trendDirection,
    })),
    partnerships: profile.brandPartnerships.map((p) => ({
      brandName: p.brandName,
      brandLogoUrl: p.brandLogoUrl,
      campaignName: p.campaignName,
    })),
  };

  const analyticsData = analytics ? serializeBigInt(analytics) : null;

  return (
    <div className="min-h-screen bg-[#2B2D31]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MediaKitLayout profile={profileData} analytics={analyticsData} />
    </div>
  );
}
