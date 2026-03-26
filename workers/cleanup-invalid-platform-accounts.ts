/**
 * Cleanup Invalid Platform Accounts
 *
 * Removes PlatformAccount records with placeholder IDs created by the
 * seed script. YouTube channel IDs always start with "UC"; anything else
 * is a fake ID that will never resolve.
 *
 * Usage:
 *   pnpm worker:cleanup-invalid-accounts -- --dry-run
 *   pnpm worker:cleanup-invalid-accounts
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const prisma = new PrismaClient();

function log(
  level: "info" | "warn",
  msg: string,
  data?: Record<string, unknown>,
) {
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console[level](`[cleanup] ${msg}${extra}`);
}

// Validators: return true if the platformUserId looks real for that platform
const VALID_ID: Partial<Record<string, (id: string) => boolean>> = {
  // YouTube channel IDs are 24 chars starting with UC
  youtube: (id) => id.startsWith("UC") && id.length === 24,
};

async function main() {
  log("info", "Scanning for invalid platform accounts...", { DRY_RUN });

  const allAccounts = await prisma.platformAccount.findMany({
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      platformUsername: true,
      creatorProfile: { select: { slug: true } },
    },
  });

  const invalid = allAccounts.filter((a) => {
    const validator = VALID_ID[a.platform];
    return validator && !validator(a.platformUserId);
  });

  log(
    "info",
    `Found ${invalid.length} invalid accounts out of ${allAccounts.length} total`,
  );

  if (invalid.length === 0) {
    log("info", "Nothing to clean up.");
    return;
  }

  // Group by platform for the report
  const byPlatform: Record<string, number> = {};
  for (const a of invalid) {
    byPlatform[a.platform] = (byPlatform[a.platform] ?? 0) + 1;
    if (DRY_RUN) {
      log("info", "DRY RUN — would delete", {
        platform: a.platform,
        platformUserId: a.platformUserId,
        platformUsername: a.platformUsername,
        creator: a.creatorProfile.slug,
      });
    }
  }

  log("info", "Breakdown by platform", byPlatform);

  if (!DRY_RUN) {
    const ids = invalid.map((a) => a.id);
    const { count } = await prisma.platformAccount.deleteMany({
      where: { id: { in: ids } },
    });
    log("info", `Deleted ${count} invalid platform accounts`);
  } else {
    log(
      "info",
      `DRY RUN complete — ${invalid.length} accounts would be deleted`,
    );
  }
}

main()
  .catch((err) => {
    console.error("[cleanup] Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
