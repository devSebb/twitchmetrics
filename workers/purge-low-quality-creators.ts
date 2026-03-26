/**
 * Purge Low-Quality Creators
 *
 * Removes creator profiles that are either seed data or trash accounts
 * discovered from Twitch with no real follower data.
 *
 * Targets profiles where:
 *   - totalFollowers = 0 AND never snapshotted (seed data / failed discovery)
 *   - OR totalFollowers > 0 but below a minimum threshold and never snapshotted
 *
 * Safe to run multiple times. Will NOT delete creators that have been
 * successfully snapshotted (lastSnapshotAt IS NOT NULL).
 *
 * Usage:
 *   pnpm worker:purge-low-quality -- --dry-run
 *   pnpm worker:purge-low-quality -- --min-followers 100   # default: 0 (zero-only)
 *   pnpm worker:purge-low-quality                         # delete zero-follower + never snapshotted
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MIN_FOLLOWERS = (() => {
  const idx = args.indexOf("--min-followers");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1]!, 10) : 0;
})();

const prisma = new PrismaClient();

function log(
  level: "info" | "warn",
  msg: string,
  data?: Record<string, unknown>,
) {
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console[level](`[purge] ${msg}${extra}`);
}

async function main() {
  log("info", "Scanning for low-quality creator profiles...", {
    DRY_RUN,
    MIN_FOLLOWERS,
  });

  // Find profiles that have never been snapshotted and have low/zero followers
  const targets = await prisma.creatorProfile.findMany({
    where: {
      lastSnapshotAt: null, // never successfully snapshotted by real workers
      totalFollowers: { lte: BigInt(MIN_FOLLOWERS) },
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      totalFollowers: true,
      primaryPlatform: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  log("info", `Found ${targets.length} profiles to purge`);

  if (targets.length === 0) {
    log("info", "Nothing to purge.");
    return;
  }

  if (DRY_RUN) {
    for (const p of targets.slice(0, 20)) {
      log("info", "DRY RUN — would delete", {
        slug: p.slug,
        displayName: p.displayName,
        totalFollowers: String(p.totalFollowers),
        platform: p.primaryPlatform,
        createdAt: p.createdAt.toISOString(),
      });
    }
    if (targets.length > 20) {
      log("info", `... and ${targets.length - 20} more`);
    }
    log(
      "info",
      `DRY RUN complete — ${targets.length} profiles would be deleted`,
    );
    return;
  }

  const ids = targets.map((p) => p.id);

  // Cascade deletes: PlatformAccount, MetricSnapshot, etc. handled by schema onDelete: Cascade
  const { count } = await prisma.creatorProfile.deleteMany({
    where: { id: { in: ids } },
  });

  log("info", `Purged ${count} low-quality creator profiles`);
}

main()
  .catch((err) => {
    console.error("[purge] Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
