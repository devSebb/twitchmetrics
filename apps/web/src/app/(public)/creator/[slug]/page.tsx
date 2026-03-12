import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import {
  CreatorHeader,
  GrowthSection,
  DemographicsSection,
  PopularGames,
  FeaturedClips,
  BrandPartnerships,
} from "@/components/creator";

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function getCreator(slug: string) {
  const creator = await db.creatorProfile.findUnique({
    where: { slug },
    include: {
      platformAccounts: true,
      growthRollups: {
        orderBy: { computedAt: "desc" },
      },
      brandPartnerships: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!creator) return null;
  return serializeBigInt(creator);
}

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

  return {
    title: `${creator.displayName} - Creator Analytics`,
    description,
    openGraph: {
      title: `${creator.displayName} | ${SITE_NAME}`,
      description: `${followersStr} total followers across ${platformNames}`,
      images: creator.avatarUrl
        ? [
            {
              url: creator.avatarUrl,
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
      images: creator.avatarUrl ? [creator.avatarUrl] : [],
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

  const platforms = creator.platformAccounts.map((a) => a.platform);

  // Serialize data for child components
  const headerData = {
    id: creator.id,
    displayName: creator.displayName,
    slug: creator.slug,
    avatarUrl: creator.avatarUrl,
    bannerUrl: creator.bannerUrl,
    bio: creator.bio,
    country: creator.country,
    state: creator.state,
    primaryPlatform: creator.primaryPlatform,
    totalFollowers: String(creator.totalFollowers),
    platformAccounts: creator.platformAccounts.map((a) => ({
      platform: a.platform,
      platformUsername: a.platformUsername,
      platformUrl: a.platformUrl,
      followerCount: a.followerCount ? String(a.followerCount) : null,
    })),
    growthRollups: creator.growthRollups.map((g) => ({
      platform: g.platform,
      delta7d: String(g.delta7d),
      pct7d: g.pct7d,
      trendDirection: g.trendDirection,
    })),
  };

  const partnershipsData = creator.brandPartnerships.map((p) => ({
    id: p.id,
    brandName: p.brandName,
    brandLogoUrl: p.brandLogoUrl,
  }));

  // Person JSON-LD for rich results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: creator.displayName,
    url: `${SITE_URL}/creator/${creator.slug}`,
    image: creator.avatarUrl ?? undefined,
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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CreatorHeader creator={headerData} />

      <GrowthSection
        slug={creator.slug}
        platforms={platforms}
        initialPlatform={creator.primaryPlatform}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left column: demographics + partnerships */}
        <div className="lg:col-span-1">
          <BrandPartnerships partnerships={partnershipsData} />
          <DemographicsSection state={creator.state} demographics={null} />
        </div>

        {/* Right column: games + clips */}
        <div className="lg:col-span-2">
          <PopularGames games={[]} />
          <FeaturedClips clips={[]} />
        </div>
      </div>
    </div>
  );
}
