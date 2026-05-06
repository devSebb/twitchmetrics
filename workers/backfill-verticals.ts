/**
 * Backfill the Game.vertical field for all existing rows.
 *
 * Rule order: igdbId IS NOT NULL → "gaming"; curated NON_GAME_CATEGORIES
 * map → mapped vertical; fallback → "gaming". Idempotent.
 *
 * Usage:
 *   tsx workers/backfill-verticals.ts             # apply
 *   tsx workers/backfill-verticals.ts --dry-run   # report only, no writes
 */

import { PrismaClient, type Vertical } from "@prisma/client";
import {
  classifyVertical,
  VERTICAL_ORDER,
} from "../apps/web/src/lib/constants/categories";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const BATCH_SIZE = 500;

const prisma = new PrismaClient();

async function run(): Promise<void> {
  const total = await prisma.game.count();
  console.log(`Total games: ${total}`);
  if (total === 0) return;

  const counts: Record<Vertical, number> = {
    gaming: 0,
    irl: 0,
    music: 0,
    creative: 0,
    sports: 0,
    other: 0,
  };
  let updated = 0;
  let skipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.game.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: { id: true, name: true, igdbId: true, vertical: true },
    });
    if (batch.length === 0) break;

    for (const game of batch) {
      const target = classifyVertical(game);
      counts[target]++;
      if (game.vertical === target) {
        skipped++;
        continue;
      }
      if (!DRY_RUN) {
        await prisma.game.update({
          where: { id: game.id },
          data: { vertical: target },
        });
      }
      updated++;
    }

    cursor = batch[batch.length - 1]?.id;
    if (batch.length < BATCH_SIZE) break;
  }

  console.log("\n--- Results ---");
  for (const v of VERTICAL_ORDER) {
    console.log(`  ${v.padEnd(10)} ${counts[v]}`);
  }
  console.log(`\n  ${DRY_RUN ? "Would update" : "Updated"}: ${updated}`);
  console.log(`  Already correct: ${skipped}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
