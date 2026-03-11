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
    igdbId: 121,
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
// MAIN SEED
// ============================================================

async function main() {
  console.log("Clearing existing data...");

  // Delete in dependency order
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
  await prisma.user.deleteMany();

  console.log("Seeding creators...");

  // Use a fixed seed for reproducibility
  faker.seed(42);

  // ============================================================
  // USERS (5 claimed creators will link to these)
  // ============================================================

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
  // 50 CREATOR PROFILES
  // ============================================================

  const usedSlugs = new Set<string>();
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
  }

  console.log(`  Created ${platformAccountCount} platform accounts`);

  // ============================================================
  // METRIC SNAPSHOTS (90 days per creator per platform)
  // ============================================================

  console.log("Seeding metric snapshots (this may take a moment)...");

  const DAYS = 90;
  const now = new Date();
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
  // SUMMARY
  // ============================================================

  console.log("\nSeed complete:");
  console.log(`  - ${users.length} users`);
  console.log(
    `  - ${creators.length} creator profiles (${creatorData.filter((c) => c.state === "claimed").length} claimed)`,
  );
  console.log(`  - ${platformAccountCount} platform accounts`);
  console.log(`  - ${snapshotCount} metric snapshots`);
  console.log(`  - ${games.length} games`);
  console.log(`  - ${games.length * 6} game viewer snapshots`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
