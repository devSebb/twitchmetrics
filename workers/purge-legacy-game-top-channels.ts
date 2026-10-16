/**
 * Delete GameTopChannel rows written by retired writers.
 *
 * Only three jobs write GameTopChannel today, and each replaces its own rows:
 * twitch_api (game-snapshot), kick_api (kick-category-snapshot) and
 * streamhatchet_live (live-channels). Everything else is left over from writers
 * that no longer exist — 3,718 rows with source "api", last written
 * 2026-05-18 — and nothing will ever delete them. The game page now hides them
 * (game-top-channels.ts), but until then they were League of Legends' top two
 * "viewers now" (QA, 2026-10).
 *
 * Dry run by default: prints what would go, per source.
 *
 * Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/purge-legacy-game-top-channels.ts
 *   npx tsx --env-file=apps/web/.env.local workers/purge-legacy-game-top-channels.ts --write
 */
import { prisma } from "@twitchmetrics/database";

const LIVE_SOURCES = ["twitch_api", "kick_api", "streamhatchet_live"];
const WRITE = process.argv.includes("--write");

function log(msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [purge-legacy-game-top-channels] ${msg}`;
  console.info(data === undefined ? line : `${line} ${JSON.stringify(data)}`);
}

async function main() {
  const where = { source: { notIn: LIVE_SOURCES } };
  const bySource = await prisma.gameTopChannel.groupBy({
    by: ["source"],
    where,
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  const total = bySource.reduce((sum, row) => sum + row._count._all, 0);

  log(WRITE ? "Deleting" : "Dry run — would delete", {
    total,
    bySource: bySource.map((row) => ({
      source: row.source,
      rows: row._count._all,
      lastWritten: row._max.updatedAt?.toISOString() ?? null,
    })),
  });

  if (!WRITE || total === 0) return;

  const { count } = await prisma.gameTopChannel.deleteMany({ where });
  log("Deleted", { count });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
