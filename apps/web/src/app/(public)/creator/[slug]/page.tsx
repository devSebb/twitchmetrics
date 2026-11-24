import {
  getPublicCreator,
  getPublicCreatorView,
} from "@/lib/public-creator-view";
import { CreatorProfileLayout } from "@/components/creator/CreatorProfileLayout";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/server/db";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { resolveAvatar } from "@/lib/avatar";
import { getPlatformProfileUrl } from "@/lib/platform-profile-url";
import {
  creatorRobots,
  resolveCreatorSlug,
} from "@/server/services/creator-visibility";

type PageProps = {
  params: Promise<{ slug: string }>;
};

// ISR: profile shells cache for an hour; live widgets hydrate via tRPC.
// Empty generateStaticParams opts the route into on-demand static
// generation — without it every request re-renders from scratch.
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const creator = await getPublicCreator(slug);

  if (!creator) {
    // Renamed slugs (SlugRedirect) canonicalize to the new URL.
    const resolved = await resolveCreatorSlug(db, slug);
    if (resolved.found && resolved.redirect) {
      return {
        title: `Creator Profile | ${SITE_NAME}`,
        robots: { index: false, follow: true },
        alternates: {
          canonical: `${SITE_URL}/creator/${resolved.canonicalSlug}`,
        },
      };
    }
    return { title: `Creator Not Found | ${SITE_NAME}` };
  }

  if (creator.mergedInto) {
    return {
      title: `Creator Profile | ${SITE_NAME}`,
      robots: { index: false, follow: true },
      alternates: {
        canonical: `${SITE_URL}/creator/${creator.mergedInto.slug}`,
      },
    };
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
    title: `${creator.displayName} Stats & Media Kit`,
    description,
    robots: creatorRobots(creator.listed),
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
  const creator = await getPublicCreator(slug);

  if (!creator) {
    // Renamed slugs (SlugRedirect) 308 to the canonical URL.
    const resolved = await resolveCreatorSlug(db, slug);
    if (resolved.found && resolved.redirect) {
      permanentRedirect(`/creator/${resolved.canonicalSlug}`);
    }
    notFound();
  }

  // Merged profiles are redirect stubs — send old links to the canonical slug.
  if (creator.mergedInto) {
    permanentRedirect(`/creator/${creator.mergedInto.slug}`);
  }

  const view = await getPublicCreatorView(creator);
  const avatarUrl = view.headerData.avatarUrl;

  // Person JSON-LD for rich results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: creator.displayName,
    url: `${SITE_URL}/creator/${creator.slug}`,
    image: avatarUrl ?? undefined,
    description: creator.bio ?? undefined,
    sameAs: creator.platformAccounts
      .map((a) =>
        getPlatformProfileUrl(a.platform, a.platformUrl, a.platformUsername),
      )
      .filter((url): url is string => url !== null),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/FollowAction",
      userInteractionCount: Number(creator.totalFollowers),
    },
  };

  // BreadcrumbList JSON-LD for search result breadcrumbs
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Creators",
        item: `${SITE_URL}/creators`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: creator.displayName,
        item: `${SITE_URL}/creator/${creator.slug}`,
      },
    ],
  };

  return (
    <div className="noticed">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <CreatorProfileLayout {...view} />
    </div>
  );
}
