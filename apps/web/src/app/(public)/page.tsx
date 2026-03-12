import type { Metadata } from "next";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  DEFAULT_DESCRIPTION,
} from "@/lib/constants/seo";
import {
  HeroSection,
  CreatorShowcase,
  ValueProps,
  TrendingSection,
  CtaSection,
} from "@/components/landing";

async function getLandingData() {
  const [topCreatorsRaw, trendingRollupsRaw, topGamesRaw] = await Promise.all([
    // Top 10 creators by followers (for showcase + top channels)
    db.creatorProfile.findMany({
      orderBy: { totalFollowers: "desc" },
      take: 10,
      include: {
        platformAccounts: true,
        growthRollups: {
          orderBy: { computedAt: "desc" },
        },
      },
    }),
    // Trending creators by 7d growth
    db.creatorGrowthRollup.findMany({
      orderBy: { delta7d: "desc" },
      take: 5,
      include: {
        creatorProfile: {
          include: { platformAccounts: true },
        },
      },
    }),
    // Top games by current viewers
    db.game.findMany({
      orderBy: { currentViewers: "desc" },
      take: 5,
    }),
  ]);

  // Shape top creators
  const topCreators = serializeBigInt(topCreatorsRaw).map((c) => ({
    displayName: c.displayName,
    slug: c.slug,
    avatarUrl: c.avatarUrl,
    totalFollowers: String(c.totalFollowers),
    primaryPlatform: c.primaryPlatform,
    platformAccounts: c.platformAccounts.map((a) => ({
      platform: a.platform,
      platformUsername: a.platformUsername,
    })),
    growthRollup: (() => {
      const r =
        c.growthRollups.find((g) => g.platform === c.primaryPlatform) ??
        c.growthRollups[0] ??
        null;
      if (!r) return null;
      return {
        delta7d: String(r.delta7d),
        pct7d: r.pct7d,
        trendDirection: r.trendDirection,
      };
    })(),
  }));

  // Shape trending creators from rollups
  const trendingCreators = serializeBigInt(trendingRollupsRaw).map((r) => {
    const c = r.creatorProfile;
    return {
      displayName: c.displayName,
      slug: c.slug,
      avatarUrl: c.avatarUrl,
      totalFollowers: String(c.totalFollowers),
      primaryPlatform: c.primaryPlatform,
      platformAccounts: c.platformAccounts.map((a) => ({
        platform: a.platform,
        platformUsername: a.platformUsername,
      })),
      growthRollup: {
        delta7d: String(r.delta7d),
        pct7d: r.pct7d,
        trendDirection: r.trendDirection,
      },
    };
  });

  // Shape top games
  const topGames = topGamesRaw.map((g) => ({
    name: g.name,
    slug: g.slug,
    coverImageUrl: g.coverImageUrl,
    currentViewers: g.currentViewers,
    currentChannels: g.currentChannels,
  }));

  return { topCreators, trendingCreators, topGames };
}

export const metadata: Metadata = {
  title: `${SITE_NAME} | Creator Analytics Platform`,
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} | Creator Analytics Platform`,
    description: DEFAULT_DESCRIPTION,
    type: "website",
    images: [
      { url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME },
    ],
  },
  alternates: { canonical: SITE_URL },
};

function JsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default async function LandingPage() {
  const { topCreators, trendingCreators, topGames } = await getLandingData();

  return (
    <>
      <JsonLd />
      <HeroSection />
      <CreatorShowcase creators={topCreators} />
      <ValueProps />
      <TrendingSection
        topChannels={topCreators.slice(0, 5)}
        topGames={topGames}
        trendingCreators={trendingCreators}
      />
      <CtaSection />
    </>
  );
}
