/**
 * Repairs platformUrl values written before ingest validated them: every
 * stored URL is re-run through the same normalizer new writes use. Canonical
 * URLs are kept, normalizable ones (http://, scheme-less) are rewritten, and
 * anything that still fails the platform host allowlist is nulled — render
 * falls back to building a URL from the username where possible.
 *
 * Dry-run is the default. Useful options:
 *   --write
 *   --batch-size 1000
 *   --limit 10000       (0 means no limit)
 *   --cursor <uuid>
 *   --sleep-ms 100
 */
import { PrismaClient } from "@prisma/client";
import { normalizePlatformUrlForStorage } from "../apps/web/src/lib/platform-profile-url";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function integerArg(
  name: string,
  fallback: number,
  options: { minimum: number; maximum: number },
): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(options.maximum, Math.max(options.minimum, value));
}

const write = args.includes("--write");
const batchSize = integerArg("--batch-size", 1_000, {
  minimum: 100,
  maximum: 5_000,
});
const limit = integerArg("--limit", 10_000, {
  minimum: 0,
  maximum: 5_000_000,
});
const sleepMs = integerArg("--sleep-ms", 100, {
  minimum: 0,
  maximum: 10_000,
});
const initialCursor = argValue("--cursor");

const MAX_SAMPLES = 20;

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function main() {
  let cursor = initialCursor;
  let scanned = 0;
  let kept = 0;
  let rewritten = 0;
  let nulled = 0;
  const byPlatform: Record<string, { rewritten: number; nulled: number }> = {};
  const samples: { platform: string; from: string; to: string | null }[] = [];

  console.info(
    JSON.stringify({
      mode: write ? "write" : "dry-run",
      batchSize,
      limit,
      cursor: cursor ?? null,
    }),
  );

  while (limit === 0 || scanned < limit) {
    const take = limit === 0 ? batchSize : Math.min(batchSize, limit - scanned);
    const accounts = await prisma.platformAccount.findMany({
      where: { platformUrl: { not: null } },
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, platform: true, platformUrl: true },
    });
    if (accounts.length === 0) break;

    for (const account of accounts) {
      const original = account.platformUrl!;
      const normalized = normalizePlatformUrlForStorage(
        account.platform,
        original,
      );

      if (normalized === original) {
        kept++;
        continue;
      }

      const bucket = (byPlatform[account.platform] ??= {
        rewritten: 0,
        nulled: 0,
      });
      if (normalized === null) {
        nulled++;
        bucket.nulled++;
      } else {
        rewritten++;
        bucket.rewritten++;
      }
      if (samples.length < MAX_SAMPLES) {
        samples.push({
          platform: account.platform,
          from: original.slice(0, 200),
          to: normalized,
        });
      }

      if (write) {
        // Guarded on the value we read so a concurrent ingest write wins.
        await prisma.platformAccount.updateMany({
          where: { id: account.id, platformUrl: original },
          data: { platformUrl: normalized },
        });
      }
    }

    scanned += accounts.length;
    cursor = accounts.at(-1)!.id;
    console.info(
      JSON.stringify({ scanned, kept, rewritten, nulled, nextCursor: cursor }),
    );

    if (accounts.length < take) break;
    if (sleepMs > 0) await sleep(sleepMs);
  }

  console.info(
    JSON.stringify({
      complete: limit === 0,
      scanned,
      kept,
      rewritten,
      nulled,
      byPlatform,
      samples,
      nextCursor: cursor ?? null,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
