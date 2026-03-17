/**
 * Search Reindex Worker
 *
 * Rebuilds searchText columns on CreatorProfile and Game to keep
 * pg_trgm search accurate as usernames/display names change.
 *
 * Usage:
 *   tsx workers/search-reindex.ts                          # Reindex all
 *   tsx workers/search-reindex.ts --dry-run                # Count without writing
 *   tsx workers/search-reindex.ts --scope creators         # Only creators
 *   tsx workers/search-reindex.ts --scope games            # Only games
 */

import { PrismaClient } from "@prisma/client";

// ============================================================
// CONFIGURATION
// ============================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SCOPE = (() => {
  const idx = args.indexOf("--scope");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : "all";
})();

const BATCH_SIZE = 100;
const prisma = new PrismaClient();

// ============================================================
// LOGGING (lightweight — workers don't use pino)
// ============================================================

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  const prefix = `[search-reindex] [${level.toUpperCase()}]`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ============================================================
// REINDEX CREATORS
// ============================================================

async function reindexCreators(): Promise<number> {
  const creators = await prisma.creatorProfile.findMany({
    select: {
      id: true,
      displayName: true,
      slug: true,
      searchText: true,
      platformAccounts: {
        select: { platformUsername: true, platformDisplayName: true },
      },
    },
  });

  log("info", `Found ${creators.length} creators to reindex`);

  let updated = 0;
  let unchanged = 0;

  for (let i = 0; i < creators.length; i += BATCH_SIZE) {
    const batch = creators.slice(i, i + BATCH_SIZE);

    for (const creator of batch) {
      // Build searchText from all sources
      const parts = [
        creator.displayName,
        creator.slug,
        ...creator.platformAccounts
          .map((a) => a.platformUsername)
          .filter(Boolean),
        ...creator.platformAccounts
          .map((a) => a.platformDisplayName)
          .filter(Boolean),
      ];
      const searchText = [...new Set(parts)].join(" ").toLowerCase();

      // Skip if unchanged
      if (searchText === creator.searchText) {
        unchanged++;
        continue;
      }

      if (DRY_RUN) {
        log("info", "DRY RUN — would update creator searchText", {
          slug: creator.slug,
          old: creator.searchText,
          new: searchText,
        });
      } else {
        await prisma.creatorProfile.update({
          where: { id: creator.id },
          data: { searchText },
        });
      }
      updated++;
    }
  }

  log("info", `Creators reindexed`, { updated, unchanged });
  return updated;
}

// ============================================================
// REINDEX GAMES
// ============================================================

async function reindexGames(): Promise<number> {
  const games = await prisma.game.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      searchText: true,
      developer: true,
      publisher: true,
      genres: true,
    },
  });

  log("info", `Found ${games.length} games to reindex`);

  let updated = 0;
  let unchanged = 0;

  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const batch = games.slice(i, i + BATCH_SIZE);

    for (const game of batch) {
      const parts = [
        game.name,
        game.slug,
        game.developer,
        game.publisher,
        ...game.genres,
      ].filter(Boolean);
      const searchText = [...new Set(parts)].join(" ").toLowerCase();

      if (searchText === game.searchText) {
        unchanged++;
        continue;
      }

      if (DRY_RUN) {
        log("info", "DRY RUN — would update game searchText", {
          slug: game.slug,
          old: game.searchText,
          new: searchText,
        });
      } else {
        await prisma.game.update({
          where: { id: game.id },
          data: { searchText },
        });
      }
      updated++;
    }
  }

  log("info", `Games reindexed`, { updated, unchanged });
  return updated;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log("info", "Starting search reindex", { DRY_RUN, SCOPE });

  let creatorsUpdated = 0;
  let gamesUpdated = 0;

  if (SCOPE === "all" || SCOPE === "creators") {
    creatorsUpdated = await reindexCreators();
  }

  if (SCOPE === "all" || SCOPE === "games") {
    gamesUpdated = await reindexGames();
  }

  log("info", "Search reindex complete", { creatorsUpdated, gamesUpdated });
}

main()
  .catch((err) => {
    log("error", "Worker failed", { error: String(err) });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
