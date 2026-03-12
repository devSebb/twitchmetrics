import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
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

export default async function LandingPage() {
  const { topCreators, trendingCreators, topGames } = await getLandingData();

  return (
    <>
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
