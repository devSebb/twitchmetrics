import {
  PrismaClient,
  Platform,
  ProfileState,
  SnapshotTier,
} from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

// ============================================================
// CONSTANTS
// ============================================================

const PLATFORMS: Platform[] = ["twitch", "youtube", "instagram", "tiktok", "x"];

const PLATFORM_WEIGHTS: Record<Platform, number> = {
  twitch: 0.5,
  youtube: 0.2,
  instagram: 0.15,
  tiktok: 0.1,
  x: 0.05,
  kick: 0,
};

const GAME_DATA = [
  {
    name: "Fortnite",
    slug: "fortnite",
    twitchGameId: "33214",
    igdbId: 1905,
    developer: "Epic Games",
    publisher: "Epic Games",
    genres: ["Battle Royale", "Shooter"],
    platforms: ["PC", "PlayStation", "Xbox", "Nintendo Switch", "Mobile"],
    releaseDate: "2017-07-21",
    summary: "Epic Games' battle royale phenomenon",
  },
  {
    name: "League of Legends",
    slug: "league-of-legends",
    twitchGameId: "21779",
    igdbId: 115,
    developer: "Riot Games",
    publisher: "Riot Games",
    genres: ["MOBA", "Strategy"],
    platforms: ["PC"],
    releaseDate: "2009-10-27",
    summary: "Riot Games' team-based strategy game",
  },
  {
    name: "Valorant",
    slug: "valorant",
    twitchGameId: "516575",
    igdbId: 126459,
    developer: "Riot Games",
    publisher: "Riot Games",
    genres: ["FPS", "Tactical Shooter"],
    platforms: ["PC"],
    releaseDate: "2020-06-02",
    summary: "Riot Games' tactical first-person shooter",
  },
  {
    name: "Grand Theft Auto V",
    slug: "grand-theft-auto-v",
    twitchGameId: "32982",
    igdbId: 1020,
    developer: "Rockstar North",
    publisher: "Rockstar Games",
    genres: ["Action", "Adventure", "Open World"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2013-09-17",
    summary: "Rockstar Games' open world action-adventure",
  },
  {
    name: "Minecraft",
    slug: "minecraft",
    twitchGameId: "27471",
    igdbId: 121,
    developer: "Mojang Studios",
    publisher: "Xbox Game Studios",
    genres: ["Sandbox", "Survival"],
    platforms: ["PC", "PlayStation", "Xbox", "Nintendo Switch", "Mobile"],
    releaseDate: "2011-11-18",
    summary: "Mojang's sandbox building and survival game",
  },
  {
    name: "Apex Legends",
    slug: "apex-legends",
    twitchGameId: "511224",
    igdbId: 114795,
    developer: "Respawn",
    publisher: "EA",
    genres: ["Battle Royale", "FPS"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2019-02-04",
    summary: "Respawn's free-to-play battle royale shooter",
  },
  {
    name: "Counter-Strike 2",
    slug: "counter-strike-2",
    twitchGameId: "32399",
    igdbId: 252882,
    developer: "Valve",
    publisher: "Valve",
    genres: ["FPS", "Tactical Shooter"],
    platforms: ["PC"],
    releaseDate: "2023-09-27",
    summary: "Valve's iconic tactical FPS",
  },
  {
    name: "Dota 2",
    slug: "dota-2",
    twitchGameId: "29595",
    igdbId: 126,
    developer: "Valve",
    publisher: "Valve",
    genres: ["MOBA", "Strategy"],
    platforms: ["PC"],
    releaseDate: "2013-07-09",
    summary: "Valve's complex multiplayer online battle arena",
  },
  {
    name: "Overwatch 2",
    slug: "overwatch-2",
    twitchGameId: "515025",
    igdbId: 152751,
    developer: "Blizzard",
    publisher: "Blizzard",
    genres: ["FPS", "Hero Shooter"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2022-10-04",
    summary: "Blizzard's team-based hero shooter",
  },
  {
    name: "Call of Duty: Warzone",
    slug: "call-of-duty-warzone",
    twitchGameId: "512710",
    igdbId: 131800,
    developer: "Infinity Ward",
    publisher: "Activision",
    genres: ["Battle Royale", "FPS"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2020-03-10",
    summary: "Activision's free-to-play battle royale",
  },
  {
    name: "Rocket League",
    slug: "rocket-league",
    twitchGameId: "30921",
    igdbId: 3831,
    developer: "Psyonix",
    publisher: "Psyonix",
    genres: ["Sports", "Racing"],
    platforms: ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
    releaseDate: "2015-07-07",
    summary: "Soccer meets rocket-powered cars",
  },
  {
    name: "World of Warcraft",
    slug: "world-of-warcraft",
    twitchGameId: "18122",
    igdbId: 1025,
    developer: "Blizzard",
    publisher: "Blizzard",
    genres: ["MMORPG"],
    platforms: ["PC"],
    releaseDate: "2004-11-23",
    summary: "The iconic MMORPG from Blizzard",
  },
  {
    name: "Elden Ring",
    slug: "elden-ring",
    twitchGameId: "512953",
    igdbId: 119133,
    developer: "FromSoftware",
    publisher: "Bandai Namco",
    genres: ["Action RPG", "Open World"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2022-02-25",
    summary: "FromSoftware's open-world action RPG",
  },
  {
    name: "Genshin Impact",
    slug: "genshin-impact",
    twitchGameId: "513181",
    igdbId: 119277,
    developer: "miHoYo",
    publisher: "miHoYo",
    genres: ["Action RPG", "Open World"],
    platforms: ["PC", "PlayStation", "Mobile"],
    releaseDate: "2020-09-28",
    summary: "miHoYo's open-world action RPG",
  },
  {
    name: "Dead by Daylight",
    slug: "dead-by-daylight",
    twitchGameId: "491487",
    igdbId: 18866,
    developer: "Behaviour Interactive",
    publisher: "Behaviour Interactive",
    genres: ["Horror", "Survival"],
    platforms: ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
    releaseDate: "2016-06-14",
    summary: "Asymmetric survival horror game",
  },
  {
    name: "Escape from Tarkov",
    slug: "escape-from-tarkov",
    twitchGameId: "491931",
    igdbId: 21385,
    developer: "Battlestate Games",
    publisher: "Battlestate Games",
    genres: ["FPS", "Survival"],
    platforms: ["PC"],
    releaseDate: "2017-07-27",
    summary: "Hardcore tactical FPS survival game",
  },
  {
    name: "Rust",
    slug: "rust",
    twitchGameId: "263490",
    igdbId: 1816,
    developer: "Facepunch Studios",
    publisher: "Facepunch Studios",
    genres: ["Survival", "Crafting"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2018-02-08",
    summary: "Multiplayer survival crafting game",
  },
  {
    name: "Among Us",
    slug: "among-us",
    twitchGameId: "510218",
    igdbId: 68415,
    developer: "InnerSloth",
    publisher: "InnerSloth",
    genres: ["Social Deduction", "Party"],
    platforms: ["PC", "Mobile", "Nintendo Switch"],
    releaseDate: "2018-06-15",
    summary: "Social deduction party game",
  },
  {
    name: "FIFA 24",
    slug: "fifa-24",
    twitchGameId: "2085171694",
    igdbId: 252886,
    developer: "EA Sports",
    publisher: "EA",
    genres: ["Sports", "Soccer"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2023-09-29",
    summary: "EA's flagship soccer simulation",
  },
  {
    name: "Diablo IV",
    slug: "diablo-iv",
    twitchGameId: "515024",
    igdbId: 121510,
    developer: "Blizzard",
    publisher: "Blizzard",
    genres: ["Action RPG", "Dungeon Crawler"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2023-06-05",
    summary: "Blizzard's action RPG dungeon crawler",
  },
  {
    name: "Baldur's Gate 3",
    slug: "baldurs-gate-3",
    twitchGameId: "1669060775",
    igdbId: 119171,
    developer: "Larian Studios",
    publisher: "Larian Studios",
    genres: ["RPG", "Turn-Based"],
    platforms: ["PC", "PlayStation"],
    releaseDate: "2023-08-03",
    summary: "Larian's D&D-based RPG epic",
  },
  {
    name: "The Legend of Zelda: Tears of the Kingdom",
    slug: "zelda-totk",
    twitchGameId: "1547498967",
    igdbId: 119388,
    developer: "Nintendo EPD",
    publisher: "Nintendo",
    genres: ["Action Adventure", "Open World"],
    platforms: ["Nintendo Switch"],
    releaseDate: "2023-05-12",
    summary: "Nintendo's open-world adventure sequel",
  },
  {
    name: "Starfield",
    slug: "starfield",
    twitchGameId: "506438",
    igdbId: 96437,
    developer: "Bethesda",
    publisher: "Bethesda",
    genres: ["RPG", "Open World", "Space"],
    platforms: ["PC", "Xbox"],
    releaseDate: "2023-09-06",
    summary: "Bethesda's space exploration RPG",
  },
  {
    name: "Path of Exile",
    slug: "path-of-exile",
    twitchGameId: "29307",
    igdbId: 473,
    developer: "Grinding Gear Games",
    publisher: "Grinding Gear Games",
    genres: ["Action RPG", "Dungeon Crawler"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2013-10-23",
    summary: "Complex free-to-play action RPG",
  },
  {
    name: "Rainbow Six Siege",
    slug: "rainbow-six-siege",
    twitchGameId: "460630",
    igdbId: 7360,
    developer: "Ubisoft Montreal",
    publisher: "Ubisoft",
    genres: ["FPS", "Tactical Shooter"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2015-12-01",
    summary: "Tactical team-based FPS",
  },
  {
    name: "Palworld",
    slug: "palworld",
    twitchGameId: "1687578985",
    igdbId: 225725,
    developer: "Pocketpair",
    publisher: "Pocketpair",
    genres: ["Survival", "Open World"],
    platforms: ["PC", "Xbox"],
    releaseDate: "2024-01-19",
    summary: "Open-world creature-collection survival game",
  },
  {
    name: "Helldivers 2",
    slug: "helldivers-2",
    twitchGameId: "459931",
    igdbId: 136381,
    developer: "Arrowhead",
    publisher: "PlayStation",
    genres: ["Shooter", "Co-op"],
    platforms: ["PC", "PlayStation"],
    releaseDate: "2024-02-08",
    summary: "Co-op third-person shooter",
  },
  {
    name: "Street Fighter 6",
    slug: "street-fighter-6",
    twitchGameId: "497365076",
    igdbId: 205494,
    developer: "Capcom",
    publisher: "Capcom",
    genres: ["Fighting"],
    platforms: ["PC", "PlayStation", "Xbox"],
    releaseDate: "2023-06-02",
    summary: "Capcom's latest fighting game",
  },
  {
    name: "Hearthstone",
    slug: "hearthstone",
    twitchGameId: "138585",
    igdbId: 1417,
    developer: "Blizzard",
    publisher: "Blizzard",
    genres: ["Card Game", "Strategy"],
    platforms: ["PC", "Mobile"],
    releaseDate: "2014-03-11",
    summary: "Blizzard's digital collectible card game",
  },
  {
    name: "Final Fantasy XIV",
    slug: "final-fantasy-xiv",
    twitchGameId: "24241",
    igdbId: 718,
    developer: "Square Enix",
    publisher: "Square Enix",
    genres: ["MMORPG"],
    platforms: ["PC", "PlayStation"],
    releaseDate: "2013-08-27",
    summary: "Square Enix's flagship MMORPG",
  },
];

const COUNTRIES = [
  "US",
  "CA",
  "GB",
  "DE",
  "FR",
  "SE",
  "KR",
  "JP",
  "BR",
  "AU",
  "ES",
  "MX",
  "PL",
  "NO",
  "DK",
];

type GrowthPattern = "up" | "flat" | "declining" | "viral";

// ============================================================
// HELPERS
// ============================================================

function pickWeightedPlatform(): Platform {
  const rand = Math.random();
  let cumulative = 0;
  for (const p of PLATFORMS) {
    cumulative += PLATFORM_WEIGHTS[p];
    if (rand < cumulative) return p;
  }
  return "twitch";
}

function getTierForFollowers(followers: bigint): SnapshotTier {
  const count = Number(followers);
  if (count >= 100_000) return "tier1";
  if (count >= 10_000) return "tier2";
  return "tier3";
}

function pickGrowthPattern(): GrowthPattern {
  const rand = Math.random();
  if (rand < 0.3) return "up";
  if (rand < 0.7) return "flat";
  if (rand < 0.9) return "declining";
  return "viral";
}

function generateFollowerTimeseries(
  baseFollowers: number,
  pattern: GrowthPattern,
  days: number,
): number[] {
  const values: number[] = [];
  let current = baseFollowers;

  // For viral pattern, pick a random spike day
  const spikeDay =
    pattern === "viral" ? Math.floor(Math.random() * (days - 20)) + 10 : -1;
  const spikeMultiplier = 3 + Math.random() * 2; // 3x-5x

  for (let day = 0; day < days; day++) {
    const noise = 1 + (Math.random() - 0.5) * 0.02; // ±1% daily noise

    switch (pattern) {
      case "up": {
        const dailyGrowth = 1 + (0.02 + Math.random() * 0.03) / 7; // 2-5% weekly
        current = current * dailyGrowth * noise;
        break;
      }
      case "flat": {
        current = current * noise;
        break;
      }
      case "declining": {
        const dailyDecline = 1 - (0.01 + Math.random() * 0.02) / 7; // 1-3% weekly
        current = current * dailyDecline * noise;
        break;
      }
      case "viral": {
        if (day === spikeDay) {
          current = current * spikeMultiplier;
        } else if (day > spikeDay) {
          // Gradual normalize: lose ~3% per day of the spike gains
          const normalizeRate = 1 - 0.03 * noise;
          current = current * normalizeRate;
        } else {
          current = current * noise;
        }
        break;
      }
    }

    values.push(Math.max(Math.floor(current), 100));
  }

  return values;
}

// ============================================================
// DEV USER DATA — realistic fake data for every widget
// ============================================================

const DEV_BRAND_PARTNERS = [
  {
    brandName: "Rogue Energy",
    brandLogoUrl: "https://i.imgur.com/1Q9Z1Zm.png",
  },
  { brandName: "Logitech", brandLogoUrl: "https://i.imgur.com/6aJkS1L.png" },
  { brandName: "HelloFresh", brandLogoUrl: "https://i.imgur.com/3Z5j9Ux.png" },
  { brandName: "NordVPN", brandLogoUrl: "https://i.imgur.com/7hZ2w1x.png" },
  { brandName: "Chipotle", brandLogoUrl: "https://i.imgur.com/5cR3q2y.png" },
  { brandName: "Stake", brandLogoUrl: "https://i.imgur.com/4dF8t3z.png" },
  { brandName: "SteelSeries", brandLogoUrl: null },
  { brandName: "G FUEL", brandLogoUrl: null },
];

const DEV_EXTENDED_METRICS = {
  avg_viewers: 12450,
  peak_viewers: 89200,
  live_viewer_count: 15300,
  hours_streamed: 186,
  avg_stream_duration_hours: 6.2,
  subscriber_count: 24500,
  brand_safety_score: 82,
  brand_safety_rating: "safe" as const,
  brand_safety_source: "Automated analysis",
  brand_safety_tags: [
    "15+ Games",
    "Family Friendly",
    "Travel",
    "Hiking",
    "Stocks",
    "GTA V",
    "Basketball",
    "Cooking",
  ],
  top_games: [
    { name: "World of Warcraft", avgViewers: 18200, hoursPlayed: 62 },
    { name: "Path of Exile", avgViewers: 14800, hoursPlayed: 48 },
    { name: "Call of Duty: Warzone", avgViewers: 11200, hoursPlayed: 35 },
    { name: "Cyberpunk 2077", avgViewers: 9600, hoursPlayed: 22 },
    { name: "Fortnite", avgViewers: 8100, hoursPlayed: 19 },
  ],
  clips: [
    {
      id: "clip_001",
      title: "INSANE clutch in Warzone!",
      url: "https://clips.twitch.tv/example1",
      thumbnailUrl: "https://picsum.photos/seed/clip1/320/180",
      viewCount: 245000,
      createdAt: "2026-02-28T14:30:00Z",
      duration: 30,
    },
    {
      id: "clip_002",
      title: "First kill of the stream",
      url: "https://clips.twitch.tv/example2",
      thumbnailUrl: "https://picsum.photos/seed/clip2/320/180",
      viewCount: 182000,
      createdAt: "2026-03-01T19:15:00Z",
      duration: 25,
    },
    {
      id: "clip_003",
      title: "Raid boss down FINALLY",
      url: "https://clips.twitch.tv/example3",
      thumbnailUrl: "https://picsum.photos/seed/clip3/320/180",
      viewCount: 134000,
      createdAt: "2026-03-05T21:00:00Z",
      duration: 45,
    },
    {
      id: "clip_004",
      title: "Chat made me do this...",
      url: "https://clips.twitch.tv/example4",
      thumbnailUrl: "https://picsum.photos/seed/clip4/320/180",
      viewCount: 98000,
      createdAt: "2026-03-08T16:45:00Z",
      duration: 20,
    },
    {
      id: "clip_005",
      title: "New personal best speedrun",
      url: "https://clips.twitch.tv/example5",
      thumbnailUrl: "https://picsum.photos/seed/clip5/320/180",
      viewCount: 76000,
      createdAt: "2026-03-10T22:30:00Z",
      duration: 60,
    },
    {
      id: "clip_006",
      title: "Reaction to 1M followers",
      url: "https://clips.twitch.tv/example6",
      thumbnailUrl: "https://picsum.photos/seed/clip6/320/180",
      viewCount: 312000,
      createdAt: "2026-03-12T12:00:00Z",
      duration: 35,
    },
  ],
};

const DEV_DEMOGRAPHICS = {
  ageGenderData: {
    "13-17": { male: 8, female: 2 },
    "18-24": { male: 32, female: 6 },
    "25-34": { male: 28, female: 5 },
    "35-44": { male: 10, female: 3 },
    "45-64": { male: 4, female: 2 },
  },
  countryData: {
    US: 42,
    GB: 14,
    CA: 11,
    DE: 8,
    BR: 6,
    FR: 5,
    AU: 4,
    SE: 3,
    KR: 3,
    JP: 2,
    Other: 2,
  },
  deviceData: {
    desktop: 62,
    mobile: 28,
    tablet: 6,
    tv: 4,
  },
  trafficSources: {
    browse: 35,
    search: 22,
    external: 18,
    notifications: 12,
    channel_page: 8,
    other: 5,
  },
};

// ============================================================
// MAIN SEED
// ============================================================

async function main() {
  console.log("Clearing existing data...");

  // Delete in dependency order
  await prisma.creatorAnalytics.deleteMany();
  await prisma.creatorGrowthRollup.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.gameViewerSnapshot.deleteMany();
  await prisma.platformAccount.deleteMany();
  await prisma.claimRequest.deleteMany();
  await prisma.talentManagerAccess.deleteMany();
  await prisma.brandPartnership.deleteMany();
  await prisma.creatorProfile.deleteMany();
  await prisma.game.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.reportLead.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding creators...");

  // Use a fixed seed for reproducibility
  faker.seed(42);

  // ============================================================
  // USERS (5 generic + 1 dev user with full data)
  // ============================================================

  // Pre-computed bcrypt hash of "password123" (12 rounds)
  const DEV_PASSWORD_HASH =
    "$2b$12$Flw.wxfey1S.CqZ1Kz3Bwu1QAUhOZt22mYp45HeotWEL.1E0dUkLy";

  const devUser = await prisma.user.create({
    data: {
      email: "dev@twitchmetrics.test",
      name: "DevStreamer",
      passwordHash: DEV_PASSWORD_HASH,
      emailVerified: new Date(),
      role: "admin",
    },
  });

  const users = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.user.create({
        data: {
          email: `creator${i + 1}@twitchmetrics.test`,
          name: faker.person.fullName(),
          emailVerified: new Date(),
          role: "creator",
        },
      }),
    ),
  );

  // ============================================================
  // DEV USER — FULLY LOADED CREATOR PROFILE
  // ============================================================

  console.log("Seeding dev user with full data...");

  const devProfile = await prisma.creatorProfile.create({
    data: {
      displayName: "DevStreamer",
      slug: "devstreamer",
      avatarUrl: "https://i.pravatar.cc/300?u=devstreamer",
      bannerUrl: "https://picsum.photos/seed/devbanner/1920/400",
      bio: "Full-time variety streamer and content creator. Competitive FPS player turned community builder. Partnered on Twitch, growing on YouTube. Welcome to the stream!",
      country: "US",
      primaryPlatform: "twitch",
      state: "claimed",
      snapshotTier: "tier1",
      totalFollowers: BigInt(1_250_000),
      totalViews: BigInt(185_000_000),
      searchText: "devstreamer dev streamer",
      userId: devUser.id,
      claimedAt: new Date("2025-06-15"),
      lastSnapshotAt: new Date(),
      widgetConfig: [
        "stats_row",
        "brand_partners",
        "demographics",
        "popular_games",
        "recent_streams",
        "featured_clips",
        "follower_growth",
        "viewer_count",
        "brand_safety",
        "platform_breakdown",
      ],
    },
  });

  // Dev user platform accounts — 4 platforms
  const devPlatformData: Array<{
    platform: Platform;
    followers: bigint;
    views: bigint;
    username: string;
  }> = [
    {
      platform: "twitch",
      followers: BigInt(850_000),
      views: BigInt(120_000_000),
      username: "devstreamer",
    },
    {
      platform: "youtube",
      followers: BigInt(320_000),
      views: BigInt(55_000_000),
      username: "DevStreamerYT",
    },
    {
      platform: "instagram",
      followers: BigInt(65_000),
      views: BigInt(8_000_000),
      username: "devstreamer_ig",
    },
    {
      platform: "x",
      followers: BigInt(15_000),
      views: BigInt(2_000_000),
      username: "devstreamer",
    },
  ];

  await prisma.platformAccount.createMany({
    data: devPlatformData.map((p) => ({
      creatorProfileId: devProfile.id,
      platform: p.platform,
      platformUserId: faker.string.numeric(10),
      platformUsername: p.username,
      platformDisplayName: "DevStreamer",
      platformUrl: `https://${p.platform === "x" ? "x.com" : p.platform + ".tv"}/${p.username}`,
      followerCount: p.followers,
      totalViews: p.views,
      isOAuthConnected: true,
      lastSyncedAt: new Date(),
      ...(p.platform === "youtube" ? { subscriberCount: p.followers } : {}),
    })),
  });

  // Dev user brand partnerships
  await prisma.brandPartnership.createMany({
    data: DEV_BRAND_PARTNERS.map((bp, i) => ({
      creatorProfileId: devProfile.id,
      brandName: bp.brandName,
      brandLogoUrl: bp.brandLogoUrl,
      campaignName: i < 4 ? `${bp.brandName} x DevStreamer` : null,
      startDate: new Date(Date.now() - (12 - i) * 30 * 24 * 60 * 60 * 1000),
      endDate:
        i < 3
          ? new Date(Date.now() - (6 - i) * 30 * 24 * 60 * 60 * 1000)
          : null,
      isPublic: true,
    })),
  });

  // Dev user metric snapshots — 90 days, all 4 platforms, WITH extendedMetrics
  const DAYS = 90;
  const now = new Date();

  for (const pData of devPlatformData) {
    const series = generateFollowerTimeseries(
      Number(pData.followers),
      "up",
      DAYS,
    );

    const snapshots = series.map((followers, dayIdx) => {
      const snapshotAt = new Date(
        now.getTime() - (DAYS - dayIdx) * 24 * 60 * 60 * 1000,
      );

      // Only include extendedMetrics on the primary platform's snapshots
      const ext =
        pData.platform === "twitch"
          ? {
              ...DEV_EXTENDED_METRICS,
              // Vary viewer counts slightly per day
              avg_viewers: Math.floor(
                DEV_EXTENDED_METRICS.avg_viewers * (0.8 + Math.random() * 0.4),
              ),
              peak_viewers: Math.floor(
                DEV_EXTENDED_METRICS.peak_viewers * (0.7 + Math.random() * 0.6),
              ),
              live_viewer_count:
                dayIdx === DAYS - 1
                  ? DEV_EXTENDED_METRICS.live_viewer_count
                  : 0,
            }
          : undefined;

      return {
        creatorProfileId: devProfile.id,
        platform: pData.platform,
        snapshotAt,
        followerCount: BigInt(followers),
        totalViews: BigInt(Math.floor(Number(pData.views) * (dayIdx / DAYS))),
        ...(pData.platform === "youtube"
          ? { subscriberCount: BigInt(followers) }
          : {}),
        postCount: Math.floor(Math.random() * 50) + dayIdx,
        extendedMetrics: ext ?? undefined,
      };
    });

    for (let j = 0; j < snapshots.length; j += 500) {
      const batch = snapshots.slice(j, j + 500);
      await prisma.metricSnapshot.createMany({ data: batch });
    }
  }

  // Dev user creator analytics — demographics data
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  for (const pData of devPlatformData.slice(0, 2)) {
    // Twitch + YouTube
    await prisma.creatorAnalytics.create({
      data: {
        creatorProfileId: devProfile.id,
        platform: pData.platform,
        periodStart: thirtyDaysAgo,
        periodEnd: now,
        estimatedMinutesWatched: BigInt(
          Math.floor(8_000_000 + Math.random() * 4_000_000),
        ),
        averageViewDuration: 1800 + Math.floor(Math.random() * 1200),
        subscribersGained: Math.floor(2000 + Math.random() * 3000),
        subscribersLost: Math.floor(200 + Math.random() * 500),
        estimatedRevenue: 12000 + Math.random() * 8000,
        views: BigInt(Math.floor(2_000_000 + Math.random() * 3_000_000)),
        likes: Math.floor(50_000 + Math.random() * 100_000),
        comments: Math.floor(5_000 + Math.random() * 15_000),
        shares: Math.floor(2_000 + Math.random() * 8_000),
        impressions: BigInt(
          Math.floor(10_000_000 + Math.random() * 20_000_000),
        ),
        reach: BigInt(Math.floor(5_000_000 + Math.random() * 10_000_000)),
        profileViews: Math.floor(100_000 + Math.random() * 200_000),
        websiteClicks: Math.floor(5_000 + Math.random() * 15_000),
        subscriberCount: Number(pData.followers),
        ageGenderData: DEV_DEMOGRAPHICS.ageGenderData,
        countryData: DEV_DEMOGRAPHICS.countryData,
        deviceData: DEV_DEMOGRAPHICS.deviceData,
        trafficSources: DEV_DEMOGRAPHICS.trafficSources,
      },
    });
  }

  // Dev user growth rollups — all platforms
  for (const pData of devPlatformData) {
    const latestFollowers = Number(pData.followers);
    const delta1d = Math.floor(latestFollowers * 0.003);
    const delta7d = Math.floor(latestFollowers * 0.018);
    const delta30d = Math.floor(latestFollowers * 0.065);

    await prisma.creatorGrowthRollup.create({
      data: {
        creatorProfileId: devProfile.id,
        platform: pData.platform,
        followerCount: pData.followers,
        delta1d: BigInt(delta1d),
        delta7d: BigInt(delta7d),
        delta30d: BigInt(delta30d),
        pct1d: 0.3,
        pct7d: 1.8,
        pct30d: 6.5,
        trendDirection: "UP",
        acceleration: "ACCELERATING",
      },
    });
  }

  console.log(
    "  Dev user fully seeded (4 platforms, partnerships, analytics, snapshots)",
  );

  // ============================================================
  // 50 CREATOR PROFILES
  // ============================================================

  const usedSlugs = new Set<string>(["devstreamer"]);
  const creatorData: Array<{
    displayName: string;
    slug: string;
    primaryPlatform: Platform;
    totalFollowers: bigint;
    state: ProfileState;
    userId: string | null;
    country: string;
  }> = [];

  for (let i = 0; i < 50; i++) {
    const isClaimed = i < 5;
    const primaryPlatform = pickWeightedPlatform();

    // Generate follower count: range from 1K to 10M
    const followerCount = BigInt(Math.floor(1_000 + Math.random() * 9_999_000));

    let username: string;
    do {
      username = faker.internet
        .username()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
    } while (usedSlugs.has(username) || username.length < 3);
    usedSlugs.add(username);

    creatorData.push({
      displayName: faker.internet.displayName(),
      slug: username,
      primaryPlatform,
      totalFollowers: followerCount,
      state: isClaimed ? "claimed" : "unclaimed",
      userId: isClaimed ? users[i].id : null,
      country: faker.helpers.arrayElement(COUNTRIES),
    });
  }

  const creators = await Promise.all(
    creatorData.map((data) =>
      prisma.creatorProfile.create({
        data: {
          displayName: data.displayName,
          slug: data.slug,
          avatarUrl: faker.image.avatar(),
          bio: faker.lorem.sentence(),
          country: data.country,
          primaryPlatform: data.primaryPlatform,
          state: data.state,
          snapshotTier: getTierForFollowers(data.totalFollowers),
          totalFollowers: data.totalFollowers,
          totalViews:
            data.totalFollowers * BigInt(Math.floor(50 + Math.random() * 200)),
          searchText: `${data.displayName} ${data.slug}`.toLowerCase(),
          ...(data.userId
            ? { userId: data.userId, claimedAt: new Date() }
            : {}),
        },
      }),
    ),
  );

  console.log(`  Created ${creators.length} creator profiles`);

  // ============================================================
  // PLATFORM ACCOUNTS (1-3 per creator)
  // ============================================================

  let platformAccountCount = 0;

  for (let i = 0; i < creators.length; i++) {
    const creator = creators[i];
    const data = creatorData[i];
    const numAccounts = 1 + Math.floor(Math.random() * 3); // 1-3

    const accountPlatforms = new Set<Platform>([data.primaryPlatform]);
    while (accountPlatforms.size < numAccounts) {
      accountPlatforms.add(faker.helpers.arrayElement(PLATFORMS));
    }

    const accounts = Array.from(accountPlatforms).map((platform, idx) => {
      const isPrimary = platform === data.primaryPlatform;
      const followerCount = isPrimary
        ? data.totalFollowers
        : BigInt(
            Math.floor(
              Number(data.totalFollowers) * (0.1 + Math.random() * 0.5),
            ),
          );

      return {
        creatorProfileId: creator.id,
        platform,
        platformUserId: faker.string.numeric(8),
        platformUsername: data.slug + (idx > 0 ? `_${platform}` : ""),
        platformDisplayName: data.displayName,
        platformUrl: `https://${platform}.tv/${data.slug}`,
        followerCount,
        totalViews:
          followerCount * BigInt(Math.floor(20 + Math.random() * 100)),
        ...(platform === "youtube" ? { subscriberCount: followerCount } : {}),
      };
    });

    await prisma.platformAccount.createMany({ data: accounts });
    platformAccountCount += accounts.length;

    const allUsernames = accounts.map((a) => a.platformUsername).join(" ");
    await prisma.creatorProfile.update({
      where: { id: creator.id },
      data: {
        searchText: `${data.displayName} ${allUsernames}`.toLowerCase(),
      },
    });
  }

  console.log(`  Created ${platformAccountCount} platform accounts`);

  // ============================================================
  // METRIC SNAPSHOTS (90 days per creator per platform)
  // ============================================================

  console.log("Seeding metric snapshots (this may take a moment)...");

  let snapshotCount = 0;

  for (let i = 0; i < creators.length; i++) {
    const creator = creators[i];
    const data = creatorData[i];
    const pattern = pickGrowthPattern();
    const baseFollowers = Number(data.totalFollowers);

    // Get this creator's platform accounts
    const accounts = await prisma.platformAccount.findMany({
      where: { creatorProfileId: creator.id },
    });

    for (const account of accounts) {
      const followerSeries = generateFollowerTimeseries(
        Number(account.followerCount ?? baseFollowers),
        pattern,
        DAYS,
      );

      const snapshots = followerSeries.map((followers, dayIdx) => {
        const snapshotAt = new Date(
          now.getTime() - (DAYS - dayIdx) * 24 * 60 * 60 * 1000,
        );
        return {
          creatorProfileId: creator.id,
          platform: account.platform,
          snapshotAt,
          followerCount: BigInt(followers),
          totalViews: BigInt(Math.floor(followers * (20 + Math.random() * 80))),
          ...(account.platform === "youtube"
            ? { subscriberCount: BigInt(followers) }
            : {}),
          postCount: Math.floor(Math.random() * 50) + dayIdx,
        };
      });

      // Batch in chunks of 500
      for (let j = 0; j < snapshots.length; j += 500) {
        const batch = snapshots.slice(j, j + 500);
        await prisma.metricSnapshot.createMany({ data: batch });
      }

      snapshotCount += snapshots.length;
    }
  }

  console.log(`  Created ${snapshotCount} metric snapshots`);

  // ============================================================
  // GAMES (30)
  // ============================================================

  console.log("Seeding games...");

  const games = await Promise.all(
    GAME_DATA.map((g) =>
      prisma.game.create({
        data: {
          name: g.name,
          slug: g.slug,
          twitchGameId: g.twitchGameId,
          igdbId: g.igdbId,
          coverImageUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.slug}.jpg`,
          summary: g.summary,
          releaseDate: new Date(g.releaseDate),
          genres: g.genres,
          platforms: g.platforms,
          developer: g.developer,
          publisher: g.publisher,
          searchText: [g.name, g.developer, g.publisher, ...g.genres]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
          currentViewers: Math.floor(5_000 + Math.random() * 200_000),
          currentChannels: Math.floor(500 + Math.random() * 10_000),
          peakViewers24h: Math.floor(50_000 + Math.random() * 500_000),
          avgViewers7d: Math.floor(10_000 + Math.random() * 150_000),
          hoursWatched7d: BigInt(
            Math.floor(1_000_000 + Math.random() * 25_000_000),
          ),
        },
      }),
    ),
  );

  console.log(`  Created ${games.length} games`);

  // ============================================================
  // GAME VIEWER SNAPSHOTS (6 per game)
  // ============================================================

  for (const game of games) {
    const snapshots = [];
    for (let i = 0; i < 6; i++) {
      const snapshotAt = new Date(now.getTime() - i * 30 * 60 * 1000);
      const variance = () =>
        Math.floor(Math.random() * 0.2 * game.currentViewers);
      const twitchViewers = game.currentViewers - variance();
      const youtubeViewers =
        Math.floor(game.currentViewers * 0.15) + variance();
      const kickViewers =
        Math.floor(game.currentViewers * 0.05) + Math.floor(variance() * 0.3);
      snapshots.push({
        gameId: game.id,
        snapshotAt,
        twitchViewers,
        twitchChannels: Math.floor(game.currentChannels * 0.7),
        youtubeViewers,
        youtubeChannels: Math.floor(game.currentChannels * 0.2),
        kickViewers,
        kickChannels: Math.floor(game.currentChannels * 0.1),
        totalViewers: twitchViewers + youtubeViewers + kickViewers,
        totalChannels: game.currentChannels,
      });
    }
    await prisma.gameViewerSnapshot.createMany({ data: snapshots });
  }

  console.log(`  Created ${games.length * 6} game viewer snapshots`);

  // ============================================================
  // CREATOR GROWTH ROLLUPS
  // ============================================================

  console.log("Seeding growth rollups...");

  let rollupCount = 0;

  for (let i = 0; i < creators.length; i++) {
    const creator = creators[i];

    const accounts = await prisma.platformAccount.findMany({
      where: { creatorProfileId: creator.id },
    });

    for (const account of accounts) {
      const snapshots = await prisma.metricSnapshot.findMany({
        where: {
          creatorProfileId: creator.id,
          platform: account.platform,
          followerCount: { not: null },
        },
        orderBy: { snapshotAt: "asc" },
        select: { followerCount: true, snapshotAt: true },
      });

      if (snapshots.length < 2) continue;

      const latest = snapshots[snapshots.length - 1]!;
      const latestFollowers = Number(latest.followerCount ?? 0);

      const dayIndex = (targetDaysAgo: number) => {
        const targetIdx = snapshots.length - 1 - targetDaysAgo;
        return Math.max(0, targetIdx);
      };

      const followersAt = (idx: number) =>
        Number(snapshots[idx]?.followerCount ?? latestFollowers);

      const f1d = followersAt(dayIndex(1));
      const f7d = followersAt(dayIndex(7));
      const f30d = followersAt(dayIndex(30));

      const delta1d = BigInt(latestFollowers - f1d);
      const delta7d = BigInt(latestFollowers - f7d);
      const delta30d = BigInt(latestFollowers - f30d);

      const pct1d = f1d > 0 ? ((latestFollowers - f1d) / f1d) * 100 : 0;
      const pct7d = f7d > 0 ? ((latestFollowers - f7d) / f7d) * 100 : 0;
      const pct30d = f30d > 0 ? ((latestFollowers - f30d) / f30d) * 100 : 0;

      let trendDirection = "FLAT";
      if (pct7d > 2) trendDirection = "UP";
      else if (pct7d < -2) trendDirection = "DOWN";

      let acceleration = "STABLE";
      if (Math.abs(pct1d) > Math.abs(pct7d / 7)) acceleration = "ACCELERATING";
      else if (Math.abs(pct1d) < Math.abs(pct7d / 7) * 0.5)
        acceleration = "DECELERATING";

      await prisma.creatorGrowthRollup.create({
        data: {
          creatorProfileId: creator.id,
          platform: account.platform,
          followerCount: BigInt(latestFollowers),
          delta1d,
          delta7d,
          delta30d,
          pct1d: Math.round(pct1d * 100) / 100,
          pct7d: Math.round(pct7d * 100) / 100,
          pct30d: Math.round(pct30d * 100) / 100,
          trendDirection,
          acceleration,
        },
      });

      rollupCount++;
    }
  }

  console.log(`  Created ${rollupCount} growth rollups`);

  // ============================================================
  // SUMMARY
  // ============================================================

  console.log("\nSeed complete:");
  console.log(`  - ${users.length + 1} users (incl. dev@twitchmetrics.test)`);
  console.log(
    `  - ${creators.length + 1} creator profiles (${creatorData.filter((c) => c.state === "claimed").length + 1} claimed)`,
  );
  console.log(
    `  - ${platformAccountCount + devPlatformData.length} platform accounts`,
  );
  console.log(
    `  - ${snapshotCount + DAYS * devPlatformData.length} metric snapshots`,
  );
  console.log(`  - ${rollupCount + devPlatformData.length} growth rollups`);
  console.log(`  - ${DEV_BRAND_PARTNERS.length} brand partnerships (dev user)`);
  console.log(`  - 2 creator analytics records (dev user)`);
  console.log(`  - ${games.length} games`);
  console.log(`  - ${games.length * 6} game viewer snapshots`);
  console.log(`\n  Login: dev@twitchmetrics.test (admin, slug: devstreamer)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
