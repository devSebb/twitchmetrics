/**
 * Import games from IGDB API and enrich existing Game records.
 *
 * Two modes:
 *   1. Import from Twitch top games (GET /helix/games/top)
 *   2. Enrich existing Game records by querying IGDB for metadata
 *
 * Uses Twitch app access token (same credentials for both Helix and IGDB APIs).
 *
 * Usage:
 *   tsx workers/import-games.ts                     # Full import + enrich
 *   tsx workers/import-games.ts --twitch-top 100    # Import top 100 from Twitch
 *   tsx workers/import-games.ts --enrich-only       # Only enrich existing games
 *   tsx workers/import-games.ts --dry-run            # Preview without writing
 *   tsx workers/import-games.ts --limit 10          # Limit IGDB lookups
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ENRICH_ONLY = args.includes("--enrich-only");
const TWITCH_TOP_COUNT = (() => {
  const idx = args.indexOf("--twitch-top");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 100;
})();
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 0;
})();

const IGDB_RATE_DELAY_MS = 260; // ~4 req/s with margin

const prisma = new PrismaClient();

// ============================================================
// TWITCH AUTH (shared token for Helix + IGDB)
// ============================================================

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "ERROR: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set.",
    );
    process.exit(1);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(`Failed to get app token: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ============================================================
// TWITCH HELIX — FETCH TOP GAMES
// ============================================================

type TwitchGame = {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id: string;
};

async function fetchTwitchTopGames(count: number): Promise<TwitchGame[]> {
  const token = await getAppAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID!;
  const allGames: TwitchGame[] = [];
  let cursor: string | undefined;

  while (allGames.length < count) {
    const batchSize = Math.min(count - allGames.length, 100);
    const url = new URL("https://api.twitch.tv/helix/games/top");
    url.searchParams.set("first", String(batchSize));
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
    });

    if (!res.ok) {
      console.error(`Twitch API error: ${res.status}`);
      break;
    }

    const body = (await res.json()) as {
      data: TwitchGame[];
      pagination?: { cursor?: string };
    };

    allGames.push(...body.data);
    cursor = body.pagination?.cursor;

    if (!cursor || body.data.length === 0) break;
  }

  return allGames;
}

// ============================================================
// IGDB API
// ============================================================

type IgdbGame = {
  id: number;
  name: string;
  summary?: string;
  cover?: { url: string };
  genres?: { name: string }[];
  release_dates?: { human: string; date: number }[];
  involved_companies?: {
    developer: boolean;
    publisher: boolean;
    company: { name: string };
  }[];
  platforms?: { name: string }[];
};

async function queryIgdb(body: string): Promise<IgdbGame[]> {
  const token = await getAppAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID!;

  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`IGDB API error ${res.status}: ${text}`);
    return [];
  }

  return (await res.json()) as IgdbGame[];
}

async function lookupByIgdbId(igdbId: number): Promise<IgdbGame | null> {
  const results = await queryIgdb(
    `where id = ${igdbId}; fields name,summary,cover.url,genres.name,release_dates.human,release_dates.date,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,platforms.name; limit 1;`,
  );
  return results[0] ?? null;
}

async function searchIgdb(gameName: string): Promise<IgdbGame | null> {
  // Escape double quotes in game name
  const escaped = gameName.replace(/"/g, '\\"');
  const results = await queryIgdb(
    `search "${escaped}"; fields name,summary,cover.url,genres.name,release_dates.human,release_dates.date,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,platforms.name; limit 1;`,
  );
  return results[0] ?? null;
}

function formatIgdbCoverUrl(url: string | undefined): string | null {
  if (!url) return null;
  // IGDB returns //images.igdb.com/... — convert to https and get big size
  return url.replace("//", "https://").replace("t_thumb", "t_cover_big");
}

function extractDeveloper(
  companies: IgdbGame["involved_companies"],
): string | null {
  if (!companies) return null;
  const dev = companies.find((c) => c.developer);
  return dev?.company.name ?? null;
}

function extractPublisher(
  companies: IgdbGame["involved_companies"],
): string | null {
  if (!companies) return null;
  const pub = companies.find((c) => c.publisher);
  return pub?.company.name ?? null;
}

function extractReleaseDate(dates: IgdbGame["release_dates"]): Date | null {
  if (!dates || dates.length === 0) return null;
  // Pick first valid date
  const first = dates.find((d) => d.date);
  if (!first) return null;
  return new Date(first.date * 1000);
}

// ============================================================
// SLUG GENERATION
// ============================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureUniqueGameSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.game.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return slug;
}

// ============================================================
// STEP 1: IMPORT FROM TWITCH TOP GAMES
// ============================================================

async function importFromTwitchTopGames(): Promise<void> {
  console.log(`\n=== IMPORTING TOP ${TWITCH_TOP_COUNT} TWITCH GAMES ===\n`);

  const twitchGames = await fetchTwitchTopGames(TWITCH_TOP_COUNT);
  console.log(`Fetched ${twitchGames.length} games from Twitch.`);

  let created = 0;
  let skipped = 0;
  let enriched = 0;

  for (const tg of twitchGames) {
    // Check if already exists by twitchGameId
    const existing = await prisma.game.findUnique({
      where: { twitchGameId: tg.id },
    });

    if (existing) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `  Would create: ${tg.name} (twitchId: ${tg.id}, igdbId: ${tg.igdb_id})`,
      );
      created++;
      continue;
    }

    const slug = await ensureUniqueGameSlug(generateSlug(tg.name));
    const igdbId = tg.igdb_id ? parseInt(tg.igdb_id, 10) : null;

    // Try to enrich from IGDB
    let igdbData: IgdbGame | null = null;
    if (igdbId) {
      igdbData = await lookupByIgdbId(igdbId);
      await new Promise((r) => setTimeout(r, IGDB_RATE_DELAY_MS));
      if (igdbData) enriched++;
    }

    const coverUrl = tg.box_art_url
      ? tg.box_art_url.replace("{width}", "285").replace("{height}", "380")
      : null;

    await prisma.game.create({
      data: {
        name: tg.name,
        slug,
        twitchGameId: tg.id,
        igdbId: igdbId && !isNaN(igdbId) ? igdbId : null,
        coverImageUrl: igdbData
          ? (formatIgdbCoverUrl(igdbData.cover?.url) ?? coverUrl)
          : coverUrl,
        summary: igdbData?.summary ?? null,
        genres: igdbData?.genres?.map((g) => g.name) ?? [],
        platforms: igdbData?.platforms?.map((p) => p.name) ?? [],
        developer: extractDeveloper(igdbData?.involved_companies),
        publisher: extractPublisher(igdbData?.involved_companies),
        releaseDate: extractReleaseDate(igdbData?.release_dates),
        searchText: [
          tg.name,
          extractDeveloper(igdbData?.involved_companies),
          extractPublisher(igdbData?.involved_companies),
          ...(igdbData?.genres?.map((g) => g.name) ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      },
    });

    created++;

    if (created % 10 === 0) {
      console.log(
        `  Imported ${created} games (${enriched} enriched from IGDB)...`,
      );
    }
  }

  console.log(
    `\nTwitch import: ${created} created, ${skipped} already existed, ${enriched} enriched from IGDB`,
  );
}

// ============================================================
// STEP 2: ENRICH EXISTING GAMES FROM IGDB
// ============================================================

async function enrichExistingGames(): Promise<void> {
  console.log("\n=== ENRICHING EXISTING GAMES FROM IGDB ===\n");

  // Find games without IGDB data or with missing metadata
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { summary: null },
        { genres: { isEmpty: true } },
        { developer: null },
      ],
    },
    orderBy: { currentViewers: "desc" }, // Prioritize popular games
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  console.log(`Found ${games.length} games needing enrichment.`);

  let enriched = 0;
  let notFound = 0;

  for (const game of games) {
    if (DRY_RUN) {
      console.log(`  Would enrich: ${game.name} (igdbId: ${game.igdbId})`);
      continue;
    }

    let igdbData: IgdbGame | null = null;

    // Try by IGDB ID first, then by name search
    if (game.igdbId) {
      igdbData = await lookupByIgdbId(game.igdbId);
    }

    if (!igdbData) {
      igdbData = await searchIgdb(game.name);
    }

    await new Promise((r) => setTimeout(r, IGDB_RATE_DELAY_MS));

    if (!igdbData) {
      notFound++;
      continue;
    }

    const updateData: Record<string, unknown> = {};

    if (!game.summary && igdbData.summary) {
      updateData.summary = igdbData.summary;
    }
    if (game.genres.length === 0 && igdbData.genres?.length) {
      updateData.genres = igdbData.genres.map((g) => g.name);
    }
    if (!game.developer) {
      updateData.developer = extractDeveloper(igdbData.involved_companies);
    }
    if (!game.publisher) {
      updateData.publisher = extractPublisher(igdbData.involved_companies);
    }
    if (!game.coverImageUrl && igdbData.cover?.url) {
      updateData.coverImageUrl = formatIgdbCoverUrl(igdbData.cover.url);
    }
    if (!game.releaseDate) {
      updateData.releaseDate = extractReleaseDate(igdbData.release_dates);
    }
    if (!game.igdbId && igdbData.id) {
      updateData.igdbId = igdbData.id;
    }

    // Rebuild searchText
    updateData.searchText = [
      game.name,
      (updateData.developer as string) ?? game.developer,
      (updateData.publisher as string) ?? game.publisher,
      ...((updateData.genres as string[]) ?? game.genres),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (Object.keys(updateData).length > 0) {
      await prisma.game.update({
        where: { id: game.id },
        data: updateData,
      });
      enriched++;
    }

    if (enriched % 10 === 0 && enriched > 0) {
      console.log(`  Enriched ${enriched} games...`);
    }
  }

  console.log(
    `\nEnrichment: ${enriched} games updated, ${notFound} not found on IGDB`,
  );
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  console.log("=== Game Import & Enrichment ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (LIMIT > 0) console.log(`IGDB lookup limit: ${LIMIT}`);

  try {
    const gameCount = await prisma.game.count();
    console.log(`Current game count: ${gameCount}`);

    if (!ENRICH_ONLY) {
      await importFromTwitchTopGames();
    }

    await enrichExistingGames();

    const finalCount = await prisma.game.count();
    console.log(`\nFinal game count: ${finalCount}`);

    console.log("\n=== GAME IMPORT COMPLETE ===");
  } catch (err) {
    console.error("Import failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
