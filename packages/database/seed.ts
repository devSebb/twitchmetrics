import { PrismaClient, Platform, ProfileState, SnapshotTier } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // ============================================================
  // CREATOR PROFILES + PLATFORM ACCOUNTS
  // ============================================================

  // 1. Twitch-primary creator (unclaimed)
  const ninja = await prisma.creatorProfile.create({
    data: {
      displayName: "Ninja",
      slug: "ninja",
      avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/ninja-profile.png",
      bio: "Professional gamer and content creator",
      country: "US",
      primaryPlatform: Platform.twitch,
      state: ProfileState.unclaimed,
      snapshotTier: SnapshotTier.tier1,
      totalFollowers: BigInt(18900000),
      totalViews: BigInt(580000000),
      platformAccounts: {
        create: {
          platform: Platform.twitch,
          platformUserId: "19571641",
          platformUsername: "ninja",
          platformDisplayName: "Ninja",
          platformUrl: "https://twitch.tv/ninja",
          followerCount: BigInt(18900000),
          totalViews: BigInt(580000000),
        },
      },
    },
  })

  // 2. YouTube-primary creator (unclaimed)
  const pewdiepie = await prisma.creatorProfile.create({
    data: {
      displayName: "PewDiePie",
      slug: "pewdiepie",
      avatarUrl: "https://yt3.googleusercontent.com/pewdiepie.jpg",
      bio: "Swedish YouTuber and content creator",
      country: "SE",
      primaryPlatform: Platform.youtube,
      state: ProfileState.unclaimed,
      snapshotTier: SnapshotTier.tier1,
      totalFollowers: BigInt(111000000),
      totalViews: BigInt(29000000000),
      platformAccounts: {
        create: {
          platform: Platform.youtube,
          platformUserId: "UC-lHJZR3Gqxm24_Vd_AJ5Yw",
          platformUsername: "pewdiepie",
          platformDisplayName: "PewDiePie",
          platformUrl: "https://youtube.com/@pewdiepie",
          followerCount: BigInt(111000000),
          totalViews: BigInt(29000000000),
          subscriberCount: BigInt(111000000),
        },
      },
    },
  })

  // 3. Multi-platform creator (unclaimed)
  const pokimane = await prisma.creatorProfile.create({
    data: {
      displayName: "Pokimane",
      slug: "pokimane",
      avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/pokimane-profile.png",
      bio: "Content creator, entrepreneur, and gamer",
      country: "CA",
      primaryPlatform: Platform.twitch,
      state: ProfileState.unclaimed,
      snapshotTier: SnapshotTier.tier1,
      totalFollowers: BigInt(15200000),
      totalViews: BigInt(250000000),
      platformAccounts: {
        createMany: {
          data: [
            {
              platform: Platform.twitch,
              platformUserId: "44445592",
              platformUsername: "pokimane",
              platformDisplayName: "Pokimane",
              platformUrl: "https://twitch.tv/pokimane",
              followerCount: BigInt(9400000),
              totalViews: BigInt(230000000),
            },
            {
              platform: Platform.youtube,
              platformUserId: "UCMkyEFmyhl5hp0sVXMkx4Jw",
              platformUsername: "pokimane",
              platformDisplayName: "pokimane",
              platformUrl: "https://youtube.com/@pokimane",
              followerCount: BigInt(6800000),
              totalViews: BigInt(20000000),
              subscriberCount: BigInt(6800000),
            },
          ],
        },
      },
    },
  })

  // ============================================================
  // GAMES
  // ============================================================

  const games = await Promise.all([
    prisma.game.create({
      data: {
        name: "Fortnite",
        slug: "fortnite",
        twitchGameId: "33214",
        igdbId: 1905,
        coverImageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2ekt.jpg",
        summary: "Epic Games' battle royale phenomenon",
        releaseDate: new Date("2017-07-21"),
        genres: ["Battle Royale", "Shooter"],
        platforms: ["PC", "PlayStation", "Xbox", "Nintendo Switch", "Mobile"],
        developer: "Epic Games",
        publisher: "Epic Games",
        currentViewers: 85000,
        currentChannels: 3200,
        peakViewers24h: 210000,
        avgViewers7d: 95000,
        hoursWatched7d: BigInt(16000000),
      },
    }),
    prisma.game.create({
      data: {
        name: "League of Legends",
        slug: "league-of-legends",
        twitchGameId: "21779",
        igdbId: 115,
        coverImageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co49wj.jpg",
        summary: "Riot Games' team-based strategy game",
        releaseDate: new Date("2009-10-27"),
        genres: ["MOBA", "Strategy"],
        platforms: ["PC"],
        developer: "Riot Games",
        publisher: "Riot Games",
        currentViewers: 120000,
        currentChannels: 5600,
        peakViewers24h: 450000,
        avgViewers7d: 130000,
        hoursWatched7d: BigInt(22000000),
      },
    }),
    prisma.game.create({
      data: {
        name: "Valorant",
        slug: "valorant",
        twitchGameId: "516575",
        igdbId: 126459,
        coverImageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg",
        summary: "Riot Games' tactical first-person shooter",
        releaseDate: new Date("2020-06-02"),
        genres: ["FPS", "Tactical Shooter"],
        platforms: ["PC"],
        developer: "Riot Games",
        publisher: "Riot Games",
        currentViewers: 75000,
        currentChannels: 4100,
        peakViewers24h: 180000,
        avgViewers7d: 80000,
        hoursWatched7d: BigInt(13500000),
      },
    }),
    prisma.game.create({
      data: {
        name: "Grand Theft Auto V",
        slug: "grand-theft-auto-v",
        twitchGameId: "32982",
        igdbId: 1020,
        coverImageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1ycw.jpg",
        summary: "Rockstar Games' open world action-adventure",
        releaseDate: new Date("2013-09-17"),
        genres: ["Action", "Adventure", "Open World"],
        platforms: ["PC", "PlayStation", "Xbox"],
        developer: "Rockstar North",
        publisher: "Rockstar Games",
        currentViewers: 65000,
        currentChannels: 2800,
        peakViewers24h: 150000,
        avgViewers7d: 70000,
        hoursWatched7d: BigInt(11800000),
      },
    }),
    prisma.game.create({
      data: {
        name: "Minecraft",
        slug: "minecraft",
        twitchGameId: "27471",
        igdbId: 121,
        coverImageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co49x5.jpg",
        summary: "Mojang's sandbox building and survival game",
        releaseDate: new Date("2011-11-18"),
        genres: ["Sandbox", "Survival"],
        platforms: ["PC", "PlayStation", "Xbox", "Nintendo Switch", "Mobile"],
        developer: "Mojang Studios",
        publisher: "Xbox Game Studios",
        currentViewers: 45000,
        currentChannels: 3500,
        peakViewers24h: 120000,
        avgViewers7d: 55000,
        hoursWatched7d: BigInt(9200000),
      },
    }),
  ])

  // ============================================================
  // GAME VIEWER SNAPSHOTS
  // ============================================================

  const now = new Date()
  for (const game of games) {
    const snapshots = []
    for (let i = 0; i < 6; i++) {
      const snapshotAt = new Date(now.getTime() - i * 30 * 60 * 1000) // every 30 min
      const variance = () => Math.floor(Math.random() * 0.2 * game.currentViewers)
      const twitchViewers = game.currentViewers - variance()
      const youtubeViewers = Math.floor(game.currentViewers * 0.15) + variance()
      const kickViewers = Math.floor(game.currentViewers * 0.05) + Math.floor(variance() * 0.3)
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
      })
    }
    await prisma.gameViewerSnapshot.createMany({ data: snapshots })
  }

  console.log("Seed complete:")
  console.log(`  - ${3} creator profiles`)
  console.log(`  - ${games.length} games`)
  console.log(`  - ${games.length * 6} game viewer snapshots`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
