import {
  Prisma,
  PrismaClient,
  type Platform,
  type UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const CREATOR_EMAIL = "demo.creator@twitchmetrics.net";
const MANAGER_EMAIL = "demo.manager@twitchmetrics.net";
const PASSWORD = "password123";

// Pre-computed bcrypt hash of "password123" with 12 rounds.
const PASSWORD_HASH =
  "$2b$12$Flw.wxfey1S.CqZ1Kz3Bwu1QAUhOZt22mYp45HeotWEL.1E0dUkLy";

const CREATOR_SLUG = "demo-creator";
const MANAGER_NAME = "Avery Stone";
const CREATOR_NAME = "Mika Vale";

const WIDGET_CONFIG = [
  "stats_row",
  "brand_partners",
  "demographics",
  "popular_games",
  "recent_streams",
  "featured_clips",
  "follower_growth",
  "viewer_count",
  "rates",
  "brand_safety",
  "platform_breakdown",
];

const DEMO_COUNTRY_DATA = {
  US: 0.38,
  CA: 0.13,
  GB: 0.12,
  BR: 0.09,
  MX: 0.08,
  DE: 0.06,
  ES: 0.05,
  AU: 0.04,
  Other: 0.05,
};

const DEMO_AGE_GENDER_DATA = {
  "13-17": { male: 0.05, female: 0.03, other: 0.01 },
  "18-24": { male: 0.22, female: 0.14, other: 0.02 },
  "25-34": { male: 0.18, female: 0.12, other: 0.02 },
  "35-44": { male: 0.09, female: 0.05, other: 0.01 },
  "45-54": { male: 0.04, female: 0.015, other: 0.005 },
};

const DEMO_DEVICE_DATA = {
  desktop: 0.54,
  mobile: 0.34,
  tablet: 0.07,
  tv: 0.05,
};

const DEMO_TRAFFIC_SOURCES = {
  Browse: 0.31,
  Search: 0.22,
  Suggested: 0.18,
  Notifications: 0.12,
  External: 0.1,
  Other: 0.07,
};

const PLATFORM_DATA: Array<{
  platform: Platform;
  platformUserId: string;
  username: string;
  displayName: string;
  followers: number;
  views: number;
  posts: number;
}> = [
  {
    platform: "twitch",
    platformUserId: "demo_tw_001",
    username: "mikavale",
    displayName: "MikaVale",
    followers: 1420,
    views: 84000,
    posts: 218,
  },
  {
    platform: "youtube",
    platformUserId: "demo_yt_001",
    username: "MikaValeLive",
    displayName: "Mika Vale Live",
    followers: 1350,
    views: 126000,
    posts: 84,
  },
  {
    platform: "kick",
    platformUserId: "demo_kick_001",
    username: "mikavale",
    displayName: "MikaVale",
    followers: 980,
    views: 39000,
    posts: 113,
  },
  {
    platform: "instagram",
    platformUserId: "demo_ig_001",
    username: "mikavale.gg",
    displayName: "Mika Vale",
    followers: 1110,
    views: 72000,
    posts: 146,
  },
  {
    platform: "tiktok",
    platformUserId: "demo_tt_001",
    username: "mikavaleclips",
    displayName: "Mika Vale Clips",
    followers: 1240,
    views: 188000,
    posts: 63,
  },
  {
    platform: "x",
    platformUserId: "demo_x_001",
    username: "mikavale",
    displayName: "Mika Vale",
    followers: 620,
    views: 21000,
    posts: 540,
  },
];

const DEMO_GAMES = [
  {
    name: "Valorant",
    slug: "valorant",
    twitchGameId: "516575",
    genres: ["FPS", "Tactical Shooter"],
  },
  {
    name: "Fortnite",
    slug: "fortnite",
    twitchGameId: "33214",
    genres: ["Battle Royale", "Shooter"],
  },
  {
    name: "Minecraft",
    slug: "minecraft",
    twitchGameId: "27471",
    genres: ["Sandbox", "Survival"],
  },
  {
    name: "Just Chatting",
    slug: "just-chatting",
    twitchGameId: "509658",
    genres: ["IRL", "Community"],
  },
  {
    name: "Apex Legends",
    slug: "apex-legends",
    twitchGameId: "511224",
    genres: ["Battle Royale", "FPS"],
  },
  {
    name: "League of Legends",
    slug: "league-of-legends",
    twitchGameId: "21779",
    genres: ["MOBA", "Strategy"],
  },
];

const CLIPS = [
  {
    id: "demo-clip-valorant-ace",
    title: "Last round ace to win the series",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    views: 12400,
    game: "Valorant",
  },
  {
    id: "demo-clip-minecraft-build",
    title: "Chat designed the base and it actually worked",
    thumbnailUrl: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg",
    views: 9800,
    game: "Minecraft",
  },
  {
    id: "demo-clip-fortnite-rotate",
    title: "Perfect endgame rotate with one HP",
    thumbnailUrl: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
    views: 8300,
    game: "Fortnite",
  },
  {
    id: "demo-clip-community",
    title: "Community night hit the sub goal early",
    thumbnailUrl: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/hqdefault.jpg",
    views: 7200,
    game: "Just Chatting",
  },
  {
    id: "demo-clip-apex",
    title: "Apex clutch with the squad watching",
    thumbnailUrl: "https://i.ytimg.com/vi/L_jWHffIx5E/hqdefault.jpg",
    views: 6100,
    game: "Apex Legends",
  },
  {
    id: "demo-clip-lol",
    title: "First ranked pentakill of the season",
    thumbnailUrl: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
    views: 5600,
    game: "League of Legends",
  },
];

const BRANDS = [
  ["HyperX", "Creator Kit Launch"],
  ["Elgato", "Stream Deck Mini Campaign"],
  ["Secretlab", "Studio Refresh"],
  ["GFUEL", "Community Tournament"],
  ["NordVPN", "Creator Safety Month"],
  ["Logitech G", "Weekend Setup Series"],
  ["Rogue Energy", "Late Night Queue"],
  ["SteelSeries", "Aim Lab Challenge"],
] as const;

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function dateOnly(daysBack: number): Date {
  const date = daysAgo(daysBack);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function platformUrl(platform: Platform, username: string): string {
  return `https://example.com/${platform}/${username}`;
}

function followerAt(
  finalFollowers: number,
  dayIndex: number,
  totalDays: number,
) {
  const start = Math.round(finalFollowers * 0.82);
  const progress = dayIndex / Math.max(totalDays - 1, 1);
  const curve = Math.pow(progress, 1.12);
  const seasonal = Math.sin(dayIndex / 4) * 5;
  return Math.max(
    1,
    Math.round(start + (finalFollowers - start) * curve + seasonal),
  );
}

function viewerMetrics(dayIndex: number, platform: Platform) {
  const platformBoost: Record<Platform, number> = {
    twitch: 1,
    youtube: 0.9,
    kick: 0.72,
    instagram: 0.35,
    tiktok: 0.48,
    x: 0.2,
  };
  const base = 42 * platformBoost[platform];
  const wave = Math.sin(dayIndex / 3) * 9;
  const avg = Math.max(6, Math.round(base + wave + (dayIndex % 5)));
  return {
    AVG_VIEWERS: avg,
    PEAK_VIEWERS: avg + 38 + (dayIndex % 7) * 4,
    LIVE_VIEWER_COUNT: dayIndex === 89 ? avg + 17 : 0,
    IS_LIVE: dayIndex === 89,
  };
}

function snapshotExtendedMetrics(dayIndex: number, platform: Platform) {
  const game = DEMO_GAMES[dayIndex % DEMO_GAMES.length]!;
  return {
    ...viewerMetrics(dayIndex, platform),
    CURRENT_GAME: game.name,
    CURRENT_GAME_ID: game.twitchGameId,
    brand_safety_score: 91,
    brand_safety_rating: "safe",
    brand_safety_source: "Demo seed",
    brand_safety_tags: [
      "Brand friendly",
      "English/Spanish",
      "Gaming",
      "Community focused",
      "Low profanity",
    ],
  } satisfies Prisma.InputJsonObject;
}

async function clearExistingDemoData() {
  const users = await prisma.user.findMany({
    where: { email: { in: [CREATOR_EMAIL, MANAGER_EMAIL] } },
    select: { id: true, email: true },
  });
  const userIds = users.map((user) => user.id);

  const creator = await prisma.creatorProfile.findUnique({
    where: { slug: CREATOR_SLUG },
    select: { id: true },
  });
  const creatorProfileId = creator?.id;

  if (creatorProfileId) {
    await prisma.claimRequest.deleteMany({
      where: { creatorProfileId },
    });
    await prisma.talentManagerAccess.deleteMany({
      where: { creatorProfileId },
    });
    await prisma.creatorAnalytics.deleteMany({ where: { creatorProfileId } });
    await prisma.creatorGrowthRollup.deleteMany({
      where: { creatorProfileId },
    });
    await prisma.metricSnapshot.deleteMany({ where: { creatorProfileId } });
    await prisma.creatorClip.deleteMany({ where: { creatorProfileId } });
    await prisma.brandPartnership.deleteMany({ where: { creatorProfileId } });
    await prisma.channelDailyRollup.deleteMany({ where: { creatorProfileId } });
    await prisma.channelGameDailyRollup.deleteMany({
      where: { creatorProfileId },
    });
    await prisma.streamSessionFact.deleteMany({
      where: { creatorProfileId },
    });
    await prisma.platformAccount.deleteMany({ where: { creatorProfileId } });
    await prisma.creatorProfile.delete({ where: { id: creatorProfileId } });
  }

  if (userIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.talentManagerProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.streamSessionFact.deleteMany({ where: { source: "demo" } });
  await prisma.streamHatchetSourceObject.deleteMany({
    where: { bucket: "demo", key: { startsWith: "demo/" } },
  });
}

async function createDemoUser(input: {
  email: string;
  name: string;
  role: UserRole;
}) {
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: PASSWORD_HASH,
      emailVerified: new Date(),
      role: input.role,
      roleSelectedAt: new Date(),
      hasCompletedOnboarding: true,
    },
  });
}

async function seedGames() {
  for (const game of DEMO_GAMES) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: {},
      create: {
        name: game.name,
        slug: game.slug,
        twitchGameId: game.twitchGameId,
        genres: game.genres,
        platforms: ["PC", "Console"],
        summary: `${game.name} demo category used by the TwitchMetrics seeded creator.`,
        searchText: game.name.toLowerCase(),
        currentViewers: 0,
        currentChannels: 0,
        vertical: game.name === "Just Chatting" ? "irl" : "gaming",
      },
    });
  }
}

async function seedPlatformAccounts(creatorProfileId: string) {
  await prisma.platformAccount.createMany({
    data: PLATFORM_DATA.map((account) => ({
      creatorProfileId,
      platform: account.platform,
      platformUserId: account.platformUserId,
      platformUsername: account.username,
      platformDisplayName: account.displayName,
      platformUrl: platformUrl(account.platform, account.username),
      isOAuthConnected: true,
      followerCount: BigInt(account.followers),
      totalViews: BigInt(account.views),
      subscriberCount:
        account.platform === "youtube" ? BigInt(account.followers) : null,
      postCount: account.posts,
      lastSyncedAt: new Date(),
      oauthScopes:
        account.platform === "youtube"
          ? [
              "https://www.googleapis.com/auth/youtube.readonly",
              "https://www.googleapis.com/auth/yt-analytics.readonly",
            ]
          : [],
    })),
  });
}

async function seedMetricSnapshots(creatorProfileId: string) {
  const totalDays = 90;
  const snapshots: Prisma.MetricSnapshotCreateManyInput[] = [];

  for (const account of PLATFORM_DATA) {
    for (let day = 0; day < totalDays; day++) {
      const snapshotAt = daysAgo(totalDays - day - 1);
      snapshotAt.setUTCMinutes(
        snapshotAt.getUTCMinutes() - PLATFORM_DATA.indexOf(account),
      );

      const followers = followerAt(account.followers, day, totalDays);
      const views = Math.round(
        account.views * (0.72 + (day / totalDays) * 0.28),
      );

      snapshots.push({
        creatorProfileId,
        platform: account.platform,
        snapshotAt,
        followerCount: BigInt(followers),
        totalViews: BigInt(views),
        subscriberCount:
          account.platform === "youtube" ? BigInt(followers) : null,
        postCount: Math.max(1, Math.round(account.posts * (0.75 + day / 360))),
        extendedMetrics: snapshotExtendedMetrics(day, account.platform),
      });
    }
  }

  await prisma.metricSnapshot.createMany({ data: snapshots });
}

async function seedGrowthRollups(creatorProfileId: string) {
  for (const account of PLATFORM_DATA) {
    const delta1d = Math.max(2, Math.round(account.followers * 0.006));
    const delta7d = Math.max(12, Math.round(account.followers * 0.038));
    const delta30d = Math.max(35, Math.round(account.followers * 0.11));
    await prisma.creatorGrowthRollup.create({
      data: {
        creatorProfileId,
        platform: account.platform,
        followerCount: BigInt(account.followers),
        delta1d: BigInt(delta1d),
        delta7d: BigInt(delta7d),
        delta30d: BigInt(delta30d),
        pct1d: 0.6,
        pct7d: 3.8,
        pct30d: 11,
        trendDirection: "UP",
        acceleration: "ACCELERATING",
      },
    });
  }
}

async function seedAnalytics(creatorProfileId: string) {
  const periodStart = dateOnly(30);
  const periodEnd = dateOnly(0);

  await prisma.creatorAnalytics.createMany({
    data: [
      {
        creatorProfileId,
        platform: "youtube",
        periodStart,
        periodEnd,
        estimatedMinutesWatched: BigInt(138_400),
        averageViewDuration: 286,
        subscribersGained: 184,
        subscribersLost: 21,
        estimatedRevenue: 428.75,
        views: BigInt(42_800),
        likes: 3840,
        comments: 612,
        shares: 328,
        ageGenderData: DEMO_AGE_GENDER_DATA,
        countryData: DEMO_COUNTRY_DATA,
        deviceData: DEMO_DEVICE_DATA,
        trafficSources: DEMO_TRAFFIC_SOURCES,
      },
      {
        creatorProfileId,
        platform: "instagram",
        periodStart,
        periodEnd,
        impressions: BigInt(68_500),
        reach: BigInt(31_200),
        profileViews: 3420,
        websiteClicks: 286,
        ageGenderData: DEMO_AGE_GENDER_DATA,
        countryData: DEMO_COUNTRY_DATA,
      },
      {
        creatorProfileId,
        platform: "twitch",
        periodStart,
        periodEnd,
        subscriberCount: 76,
        subscriberPoints: 98,
        estimatedMinutesWatched: BigInt(91_800),
        views: BigInt(26_300),
        ageGenderData: DEMO_AGE_GENDER_DATA,
        countryData: DEMO_COUNTRY_DATA,
      },
    ],
  });
}

async function seedBrandPartnerships(creatorProfileId: string) {
  await prisma.brandPartnership.createMany({
    data: BRANDS.map(([brandName, campaignName], index) => ({
      creatorProfileId,
      brandName,
      brandLogoUrl: null,
      campaignName,
      startDate: daysAgo(220 - index * 24),
      endDate: index < 5 ? daysAgo(170 - index * 22) : null,
      isPublic: true,
    })),
  });
}

async function seedClips(creatorProfileId: string) {
  await prisma.creatorClip.createMany({
    data: CLIPS.map((clip, index) => ({
      creatorProfileId,
      clipId: clip.id,
      title: clip.title,
      thumbnailUrl: clip.thumbnailUrl,
      url: `https://example.com/clips/${clip.id}`,
      viewCount: clip.views,
      duration: 22 + index * 4,
      gameName: clip.game,
      language: index % 2 === 0 ? "en" : "es",
      createdAt: daysAgo(4 + index * 5),
    })),
  });
}

async function seedStreamData(creatorProfileId: string) {
  const sourceObject = await prisma.streamHatchetSourceObject.create({
    data: {
      bucket: "demo",
      key: "demo/mika-vale-sessions.json",
      dataset: "demo_sessions",
      platform: "multi",
      partitionDate: dateOnly(0),
      status: "imported",
      rowCount: 24,
      importedRows: 24,
      metadata: { seed: "demo" },
      lastImportedAt: new Date(),
    },
  });

  const streamRows: Prisma.StreamSessionFactCreateManyInput[] = [];

  for (let index = 0; index < 24; index++) {
    const platformCycle = ["twitch", "kick", "ytg"] as const;
    const platform = platformCycle[index % platformCycle.length]!;
    const sourceAccount =
      platform === "ytg"
        ? PLATFORM_DATA.find((p) => p.platform === "youtube")!
        : PLATFORM_DATA.find((p) => p.platform === platform)!;
    const game = DEMO_GAMES[index % DEMO_GAMES.length]!;
    const starts = daysAgo(index + 1);
    starts.setUTCHours(20 - (index % 4), 0, 0, 0);
    const durationMinutes = 95 + (index % 6) * 18;
    const ends = new Date(starts.getTime() + durationMinutes * 60 * 1000);
    const averageViewers = 34 + (index % 8) * 9;
    const peakViewers = averageViewers + 28 + (index % 5) * 7;

    streamRows.push({
      source: "demo",
      sourceObjectId: sourceObject.id,
      creatorProfileId,
      platform,
      platformUserId: sourceAccount.platformUserId,
      platformVideoId: `demo-video-${index + 1}`,
      platformUsername: sourceAccount.username,
      platformDisplayName: sourceAccount.displayName,
      country: "US",
      partitionDate: dateOnly(index + 1),
      streamBeginsAt: starts,
      streamEndsAt: ends,
      peakViewersAt: new Date(starts.getTime() + 42 * 60 * 1000),
      sessionTitle: `${game.name} community night #${index + 1}`,
      primaryGameName: game.name,
      allGameNames: [game.name],
      airtimeMinutes: durationMinutes,
      minutesWatched: BigInt(durationMinutes * averageViewers),
      sessionViews: BigInt(durationMinutes * averageViewers * 2),
      averageViewers,
      averageViewersGlobal: averageViewers,
      peakViewers,
      share: 0.001,
      shareCrossPlatform: 0.001,
      bestRank: 120 + index,
      averageRank: 180 + index,
      worstRank: 260 + index,
      aggregation: "demo",
      rawData: { seed: "demo" },
      contentLabel: { demo: true },
      rowHash: `demo-${index + 1}`,
    });
  }

  await prisma.streamSessionFact.createMany({ data: streamRows });

  const dailyRows: Prisma.ChannelDailyRollupCreateManyInput[] = [];
  const gameRows: Prisma.ChannelGameDailyRollupCreateManyInput[] = [];

  for (let day = 1; day <= 30; day++) {
    for (const account of PLATFORM_DATA.filter((p) =>
      ["twitch", "kick", "youtube"].includes(p.platform),
    )) {
      const platform =
        account.platform === "youtube" ? "ytg" : account.platform;
      const game = DEMO_GAMES[day % DEMO_GAMES.length]!;
      const sessionCount = day % 3 === 0 ? 2 : 1;
      const airtimeMinutes = 95 + (day % 5) * 22;
      const averageViewers = 30 + (day % 9) * 8;
      const peakViewers = averageViewers + 35;

      dailyRows.push({
        source: "demo",
        platform,
        date: dateOnly(day),
        creatorProfileId,
        platformUserId: account.platformUserId,
        platformUsername: account.username,
        platformDisplayName: account.displayName,
        country: "US",
        sessionCount,
        airtimeMinutes,
        minutesWatched: BigInt(airtimeMinutes * averageViewers),
        sessionViews: BigInt(airtimeMinutes * averageViewers * 2),
        averageViewers,
        averageViewersGlobal: averageViewers,
        peakViewers,
        primaryGameName: game.name,
        gameNames: [game.name],
        bestRank: 150 + day,
        averageRank: 210 + day,
        worstRank: 300 + day,
        lastStreamAt: daysAgo(day),
      });

      gameRows.push({
        source: "demo",
        platform,
        date: dateOnly(day),
        creatorProfileId,
        platformUserId: account.platformUserId,
        platformUsername: account.username,
        platformDisplayName: account.displayName,
        gameName: game.name,
        sessionCount,
        airtimeMinutes,
        minutesWatched: BigInt(airtimeMinutes * averageViewers),
        averageViewers,
        peakViewers,
      });
    }
  }

  await prisma.channelDailyRollup.createMany({ data: dailyRows });
  await prisma.channelGameDailyRollup.createMany({ data: gameRows });
}

async function main() {
  console.log("Preparing scoped TwitchMetrics demo seed...");

  await clearExistingDemoData();
  await seedGames();

  const creatorUser = await createDemoUser({
    email: CREATOR_EMAIL,
    name: CREATOR_NAME,
    role: "creator",
  });
  const managerUser = await createDemoUser({
    email: MANAGER_EMAIL,
    name: MANAGER_NAME,
    role: "talent_manager",
  });

  await prisma.talentManagerProfile.create({
    data: {
      userId: managerUser.id,
      agencyName: "Stonebridge Talent",
      bio: "Boutique talent management for gaming creators, live streamers, and brand-safe community builders.",
      websiteUrl: "https://example.com/stonebridge-talent",
      country: "United States",
      languages: ["English", "Spanish", "Portuguese"],
      contactEmail: "partnerships@example.com",
    },
  });

  const totalFollowers = PLATFORM_DATA.reduce(
    (sum, account) => sum + account.followers,
    0,
  );
  const totalViews = PLATFORM_DATA.reduce(
    (sum, account) => sum + account.views,
    0,
  );

  const creatorProfile = await prisma.creatorProfile.create({
    data: {
      userId: creatorUser.id,
      displayName: CREATOR_NAME,
      slug: CREATOR_SLUG,
      bio: "Variety gaming creator focused on tactical shooters, cozy community nights, and sponsor-safe live events.",
      country: "United States",
      gender: "Female",
      language: "English",
      age: 27,
      interests: [
        "Gaming",
        "Esports",
        "Technology",
        "Fitness",
        "Travel",
        "Comedy",
      ],
      primaryPlatform: "twitch",
      state: "premium",
      snapshotTier: "tier3",
      totalFollowers: BigInt(totalFollowers),
      totalViews: BigInt(totalViews),
      searchText: "mika vale mikavale demo creator twitch kick youtube gaming",
      widgetConfig: WIDGET_CONFIG,
      primaryGameName: "Valorant",
      primaryGameSlug: "valorant",
      derivedLanguage: "en",
      isActiveLast30d: true,
      lastStreamAt: daysAgo(1),
      lastSnapshotAt: new Date(),
      claimedAt: daysAgo(45),
    },
  });

  await seedPlatformAccounts(creatorProfile.id);
  await seedMetricSnapshots(creatorProfile.id);
  await seedGrowthRollups(creatorProfile.id);
  await seedAnalytics(creatorProfile.id);
  await seedBrandPartnerships(creatorProfile.id);
  await seedClips(creatorProfile.id);
  await seedStreamData(creatorProfile.id);

  await prisma.talentManagerAccess.create({
    data: {
      managerId: managerUser.id,
      creatorProfileId: creatorProfile.id,
      canViewAnalytics: true,
      canEditProfile: true,
      canExportData: true,
      canManageBrands: true,
      status: "active",
      acceptedAt: daysAgo(20),
      grantedAt: daysAgo(20),
      grantedBy: managerUser.id,
    },
  });

  console.log("Demo seed complete.");
  console.log(`Creator: ${CREATOR_EMAIL} / ${PASSWORD}`);
  console.log(`Talent manager: ${MANAGER_EMAIL} / ${PASSWORD}`);
  console.log(`Public profile: /creator/${CREATOR_SLUG}`);
  console.log(`Media kit: /creator/${CREATOR_SLUG}/media-kit`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
