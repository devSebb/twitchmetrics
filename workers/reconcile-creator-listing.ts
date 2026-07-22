/**
 * Incrementally promotes Stream Hatchet creator profiles that now satisfy the
 * public catalog admission rule (at least two active days in the last 30).
 * Listing is monotonic: this worker never demotes an established creator.
 *
 * Dry-run is the default. Useful options:
 *   --write
 *   --batch-size 1000
 *   --limit 10000       (0 means no limit)
 *   --cursor <uuid>
 *   --sleep-ms 100
 */
import { PrismaClient } from "@prisma/client";

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
  maximum: 1_000_000,
});
const sleepMs = integerArg("--sleep-ms", 100, {
  minimum: 0,
  maximum: 10_000,
});
const initialCursor = argValue("--cursor");
const since = new Date();
since.setUTCDate(since.getUTCDate() - 30);
since.setUTCHours(0, 0, 0, 0);

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function main() {
  let cursor = initialCursor;
  let scanned = 0;
  let qualified = 0;
  let promoted = 0;

  console.info(
    JSON.stringify({
      mode: write ? "write" : "dry-run",
      since: since.toISOString(),
      minimumActiveDays: 2,
      batchSize,
      limit,
      cursor: cursor ?? null,
    }),
  );

  while (limit === 0 || scanned < limit) {
    const take = limit === 0 ? batchSize : Math.min(batchSize, limit - scanned);
    const profiles = await prisma.creatorProfile.findMany({
      where: {
        catalogSource: "streamhatchet",
        listed: false,
        mergedIntoId: null,
      },
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (profiles.length === 0) break;

    const ids = profiles.map((profile) => profile.id);
    const activity = await prisma.channelDailyRollup.findMany({
      where: {
        creatorProfileId: { in: ids },
        source: "streamhatchet",
        date: { gte: since },
        sessionCount: { gt: 0 },
      },
      select: { creatorProfileId: true, date: true },
    });

    const activeDates = new Map<string, Set<string>>();
    for (const row of activity) {
      if (!row.creatorProfileId) continue;
      const dates = activeDates.get(row.creatorProfileId) ?? new Set<string>();
      dates.add(row.date.toISOString().slice(0, 10));
      activeDates.set(row.creatorProfileId, dates);
    }

    const qualifiedIds = ids.filter(
      (id) => (activeDates.get(id)?.size ?? 0) >= 2,
    );
    if (write && qualifiedIds.length > 0) {
      const result = await prisma.creatorProfile.updateMany({
        where: {
          id: { in: qualifiedIds },
          listed: false,
          mergedIntoId: null,
        },
        data: { listed: true },
      });
      promoted += result.count;
    }

    scanned += profiles.length;
    qualified += qualifiedIds.length;
    cursor = profiles.at(-1)!.id;
    console.info(
      JSON.stringify({
        scanned,
        qualified,
        promoted,
        nextCursor: cursor,
      }),
    );

    if (profiles.length < take) break;
    if (sleepMs > 0) await sleep(sleepMs);
  }

  console.info(
    JSON.stringify({
      complete: limit === 0,
      scanned,
      qualified,
      promoted,
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
