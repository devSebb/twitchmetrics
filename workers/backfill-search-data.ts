/**
 * Backfill searchText for CreatorProfile and Game records.
 *
 * Finds records with empty/null searchText and populates them from
 * displayName + all platform usernames. Also ensures all slugs are valid.
 *
 * Usage:
 *   tsx workers/backfill-search-data.ts                # Full backfill
 *   tsx workers/backfill-search-data.ts --dry-run       # Count only
 *   tsx workers/backfill-search-data.ts --games-only    # Only backfill games
 *   tsx workers/backfill-search-data.ts --creators-only # Only backfill creators
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const GAMES_ONLY = args.includes("--games-only");
const CREATORS_ONLY = args.includes("--creators-only");

const BATCH_SIZE = 500;

const prisma = new PrismaClient();

// ============================================================
// SLUG UTILITIES
// ============================================================

function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================================
// BACKFILL CREATOR PROFILES
// ============================================================

async function backfillCreatorSearchText(): Promise<void> {
  console.log("\n=== BACKFILLING CREATOR searchText ===\n");

  // Find creators with empty or null searchText
  const total = await prisma.creatorProfile.count({
    where: {
      OR: [{ searchText: null }, { searchText: "" }],
    },
  });

  console.log(`Found ${total} creators with empty searchText.`);

  if (DRY_RUN || total === 0) return;

  let processed = 0;
  let updated = 0;

  // Process in batches using cursor-based pagination
  let cursor: string | undefined;

  while (true) {
    const creators = await prisma.creatorProfile.findMany({
      where: {
        OR: [{ searchText: null }, { searchText: "" }],
      },
      include: {
        platformAccounts: {
          select: {
            platformUsername: true,
            platformDisplayName: true,
          },
        },
      },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (creators.length === 0) break;

    for (const creator of creators) {
      // Collect all usernames (current + from platform accounts)
      const allNames = new Set<string>();
      allNames.add(creator.displayName.toLowerCase());
      allNames.add(creator.slug);

      for (const account of creator.platformAccounts) {
        allNames.add(account.platformUsername.toLowerCase());
        if (account.platformDisplayName) {
          allNames.add(account.platformDisplayName.toLowerCase());
        }
      }

      const searchText = Array.from(allNames).join(" ");

      await prisma.creatorProfile.update({
        where: { id: creator.id },
        data: { searchText },
      });

      updated++;
    }

    processed += creators.length;
    cursor = creators[creators.length - 1].id;

    console.log(`  Processed ${processed}/${total} (updated: ${updated})`);
  }

  console.log(`\nCreator backfill complete: ${updated} records updated.`);
}

// ============================================================
// BACKFILL GAME searchText
// ============================================================

async function backfillGameSearchText(): Promise<void> {
  console.log("\n=== BACKFILLING GAME searchText ===\n");

  const total = await prisma.game.count({
    where: {
      OR: [{ searchText: null }, { searchText: "" }],
    },
  });

  console.log(`Found ${total} games with empty searchText.`);

  if (DRY_RUN || total === 0) return;

  let updated = 0;

  const games = await prisma.game.findMany({
    where: {
      OR: [{ searchText: null }, { searchText: "" }],
    },
  });

  for (const game of games) {
    const parts: string[] = [game.name.toLowerCase()];

    if (game.developer) parts.push(game.developer.toLowerCase());
    if (game.publisher) parts.push(game.publisher.toLowerCase());
    if (game.genres.length > 0) {
      parts.push(...game.genres.map((g: string) => g.toLowerCase()));
    }

    const searchText = parts.join(" ");

    await prisma.game.update({
      where: { id: game.id },
      data: { searchText },
    });

    updated++;
  }

  console.log(`\nGame backfill complete: ${updated} records updated.`);
}

// ============================================================
// VALIDATE SLUGS
// ============================================================

async function validateSlugs(): Promise<void> {
  console.log("\n=== VALIDATING SLUGS ===\n");

  // Check for creators with invalid slugs
  const creators = await prisma.creatorProfile.findMany({
    select: { id: true, slug: true, displayName: true },
  });

  let invalidSlugs = 0;
  const seenSlugs = new Set<string>();

  for (const creator of creators) {
    const expectedSlug = generateSlug(creator.slug);

    if (creator.slug !== expectedSlug) {
      invalidSlugs++;
      if (invalidSlugs <= 10) {
        console.log(
          `  Invalid slug: "${creator.slug}" (expected: "${expectedSlug}") for "${creator.displayName}"`,
        );
      }
    }

    if (seenSlugs.has(creator.slug)) {
      console.log(`  DUPLICATE slug: "${creator.slug}"`);
    }
    seenSlugs.add(creator.slug);
  }

  console.log(
    `Slug validation: ${creators.length} checked, ${invalidSlugs} invalid.`,
  );
}

// ============================================================
// STATISTICS
// ============================================================

async function printStats(): Promise<void> {
  console.log("\n=== CURRENT DATABASE STATISTICS ===\n");

  const creators = await prisma.creatorProfile.count();
  const withSearchText = await prisma.creatorProfile.count({
    where: { searchText: { not: "" } },
  });
  const games = await prisma.game.count();
  const gamesWithSearchText = await prisma.game.count({
    where: { searchText: { not: "" } },
  });
  const platformAccounts = await prisma.platformAccount.count();
  const snapshots = await prisma.metricSnapshot.count();
  const rollups = await prisma.creatorGrowthRollup.count();

  console.log(`Creators: ${creators} (${withSearchText} with searchText)`);
  console.log(`Games: ${games} (${gamesWithSearchText} with searchText)`);
  console.log(`Platform Accounts: ${platformAccounts}`);
  console.log(`Metric Snapshots: ${snapshots}`);
  console.log(`Growth Rollups: ${rollups}`);
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  console.log("=== Search Data Backfill ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  try {
    await printStats();

    if (!GAMES_ONLY) {
      await backfillCreatorSearchText();
    }

    if (!CREATORS_ONLY) {
      await backfillGameSearchText();
    }

    await validateSlugs();
    await printStats();

    console.log("\n=== BACKFILL COMPLETE ===");
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
