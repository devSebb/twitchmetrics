/**
 * Cleanup Invalid Platform Accounts
 *
 * Removes PlatformAccount records with placeholder IDs created by the
 * seed script. YouTube channel IDs always start with "UC"; anything else
 * is a fake ID that will never resolve. YouTube is the ONLY platform with a
 * rule here — this worker knows nothing about deleted/banned Twitch or Kick
 * channels (those stop being polled via PlatformAccount.notFoundCount).
 *
 * Deletes rows, so dry-run is the default and --write is required. Accounts
 * are paged rather than loaded all at once (the table is ~1.4M rows).
 *
 * Usage:
 *   pnpm worker:cleanup-invalid-accounts            # dry-run report
 *   pnpm worker:cleanup-invalid-accounts -- --write
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
// Dry-run unless --write: this deletes rows. (--dry-run stays accepted so the
// documented invocation keeps working.)
const WRITE = args.includes("--write");
const DRY_RUN = !WRITE;
const PAGE_SIZE = 5_000;
const MAX_SAMPLES = 20;

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
  log("info", "Scanning for invalid platform accounts...", {
    mode: DRY_RUN ? "dry-run" : "write",
    platformsChecked: Object.keys(VALID_ID),
  });

  const byPlatform: Record<string, number> = {};
  const samples: Record<string, unknown>[] = [];
  let scanned = 0;
  let invalidCount = 0;
  let deleted = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.platformAccount.findMany({
      where: { platform: { in: Object.keys(VALID_ID) as never[] } },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        platform: true,
        platformUserId: true,
        platformUsername: true,
        creatorProfile: { select: { slug: true } },
      },
    });
    if (page.length === 0) break;
    scanned += page.length;
    cursor = page.at(-1)!.id;

    const invalid = page.filter((a) => {
      const validator = VALID_ID[a.platform];
      return validator && !validator(a.platformUserId);
    });
    invalidCount += invalid.length;

    for (const a of invalid) {
      byPlatform[a.platform] = (byPlatform[a.platform] ?? 0) + 1;
      if (samples.length < MAX_SAMPLES) {
        samples.push({
          platform: a.platform,
          platformUserId: a.platformUserId,
          platformUsername: a.platformUsername,
          creator: a.creatorProfile.slug,
        });
      }
    }

    if (!DRY_RUN && invalid.length > 0) {
      const { count } = await prisma.platformAccount.deleteMany({
        where: { id: { in: invalid.map((a) => a.id) } },
      });
      deleted += count;
    }

    log("info", "Progress", { scanned, invalidCount, deleted });
    if (page.length < PAGE_SIZE) break;
  }

  log("info", DRY_RUN ? "DRY RUN complete" : "Cleanup complete", {
    scanned,
    invalidCount,
    deleted,
    byPlatform,
    samples,
    ...(DRY_RUN && invalidCount > 0
      ? { hint: "re-run with --write to delete these" }
      : {}),
  });
}

main()
  .catch((err) => {
    console.error("[cleanup] Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
