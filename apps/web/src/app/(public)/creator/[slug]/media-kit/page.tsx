import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/server/db";
import {
  getPublicCreator,
  getPublicCreatorView,
} from "@/lib/public-creator-view";
import { resolveAvatar } from "@/lib/avatar";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { getPlatformProfileUrl } from "@/lib/platform-profile-url";
import { MediaKitLayout } from "@/components/media-kit/MediaKitLayout";
import {
  creatorRobots,
  resolveCreatorSlug,
} from "@/server/services/creator-visibility";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicCreator(slug);

  if (!profile) {
    const resolved = await resolveCreatorSlug(db, slug);
    if (resolved.found && resolved.redirect) {
      return {
        title: "Creator Media Kit",
        robots: { index: false, follow: true },
        alternates: {
          canonical: `${SITE_URL}/creator/${resolved.canonicalSlug}/media-kit`,
        },
      };
    }
    return { title: "Media Kit Not Found" };
  }

  if (profile.mergedInto) {
    return {
      title: "Creator Media Kit",
      robots: { index: false, follow: true },
      alternates: {
        canonical: `${SITE_URL}/creator/${profile.mergedInto.slug}/media-kit`,
      },
    };
  }

  const avatarUrl = resolveAvatar("creator", {
    creator: {
      avatarUrl: profile.avatarUrl,
      customAvatarUrl: profile.customAvatarUrl,
    },
  });
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
    `${profile.displayName}'s creator media kit with tracked analytics across ${platformNames}.`;

  return {
    title: `${profile.displayName} · Media Kit`,
    description,
    robots: creatorRobots(profile.listed),
    openGraph: {
      title: `${profile.displayName} · Media Kit`,
      description: `${followersStr} followers across ${platformNames}`,
      images: avatarUrl
        ? [
            {
              url: avatarUrl,
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
      title: `${profile.displayName} · Media Kit | ${SITE_NAME}`,
      description: `${followersStr} followers across ${platformNames}`,
      images: avatarUrl ? [avatarUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/creator/${slug}/media-kit`,
    },
  };
}

export default async function MediaKitPage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await getPublicCreator(slug);

  if (!profile) {
    const resolved = await resolveCreatorSlug(db, slug);
    if (resolved.found && resolved.redirect)
      permanentRedirect(`/creator/${resolved.canonicalSlug}/media-kit`);
    notFound();
  }

  if (profile.mergedInto) {
    permanentRedirect(`/creator/${profile.mergedInto.slug}/media-kit`);
  }

  const view = await getPublicCreatorView(profile);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.displayName,
    description: profile.bio ?? undefined,
    image: view.headerData.avatarUrl ?? undefined,
    url: `${SITE_URL}/creator/${profile.slug}`,
    sameAs: profile.platformAccounts
      .map((a) =>
        getPlatformProfileUrl(a.platform, a.platformUrl, a.platformUsername),
      )
      .filter((url): url is string => url !== null),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/FollowAction",
      userInteractionCount: Number(profile.totalFollowers),
    },
  };

  return (
    <div className="noticed min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MediaKitLayout {...view} />
    </div>
  );
}
