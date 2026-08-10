/**
 * Renames StreamHatchet machine slugs (`<name>-<16 hex>`) on listed canonical
 * creator profiles to clean slugs, leaving a SlugRedirect row behind for every
 * rename so old /creator/<slug> links 308 forever.
 *
 * Clean slug = machine slug with the hash suffix stripped. Collisions against
 * existing profile slugs, existing SlugRedirect.oldSlug rows, and clean slugs
 * assigned earlier in the same run get a -2/-3/... suffix.
 *
 * Dry-run is the default (zero writes; prints sample mappings + collision
 * stats). The SlugRedirect table may not exist yet in prod — dry-run detects
 * that via information_schema and skips the redirect collision check; write
 * mode aborts because it could not insert redirect rows.
 *
 * Each batch is applied in one transaction (createMany redirects + slug
 * updates), so a crash never leaves a rename without its redirect. Resumable:
 * pass --cursor <uuid> from the last logged nextCursor; in write mode a plain
 * re-run also resumes naturally because renamed rows stop matching the filter.
 *
 * Options:
 *   --write
 *   --batch-size 500
 *   --limit 0           (0 means no limit)
 *   --cursor <uuid>
 *   --sleep-ms 100
 *   --samples 20        (dry-run sample mappings to print)
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
const batchSize = integerArg("--batch-size", 500, {
  minimum: 50,
  maximum: 2_000,
});
const limit = integerArg("--limit", 0, { minimum: 0, maximum: 1_000_000 });
const sleepMs = integerArg("--sleep-ms", 100, { minimum: 0, maximum: 10_000 });
const sampleTarget = integerArg("--samples", 20, { minimum: 0, maximum: 200 });
const initialCursor = argValue("--cursor");

const HASH_SLUG_PATTERN = "-[0-9a-f]{16}$";
const HASH_SLUG_REGEX = /-[0-9a-f]{16}$/;
const MAX_SUFFIX = 100;

// Bases with thousands of identically-named profiles (junk display names).
// Probing 100 suffixes for each is ~300k queries per run and every candidate
// is taken anyway — `youtube-73` would be no better than the hash. Skip
// instantly; they keep their hash slugs.
const GENERIC_BASES = new Set(["youtube", "ch", "vtuber", "tv"]);

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function slugRedirectTableExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'SlugRedirect'
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function countTargets(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "CreatorProfile"
    WHERE "slug" ~ ${HASH_SLUG_PATTERN}
      AND "listed" = true
      AND "mergedIntoId" IS NULL
  `;
  return rows[0]?.count ?? 0;
}

async function fetchBatch(
  cursor: string | undefined,
  take: number,
): Promise<{ id: string; slug: string }[]> {
  return prisma.$queryRaw<{ id: string; slug: string }[]>`
    SELECT "id", "slug"
    FROM "CreatorProfile"
    WHERE "slug" ~ ${HASH_SLUG_PATTERN}
      AND "listed" = true
      AND "mergedIntoId" IS NULL
      AND (${cursor ?? null}::uuid IS NULL OR "id" > ${cursor ?? null}::uuid)
    ORDER BY "id" ASC
    LIMIT ${take}
  `;
}

/** Which of these candidate slugs are already taken in the database? */
async function takenInDatabase(
  candidates: string[],
  redirectTableExists: boolean,
): Promise<Set<string>> {
  const taken = new Set<string>();
  if (candidates.length === 0) return taken;

  const profiles = await prisma.creatorProfile.findMany({
    where: { slug: { in: candidates } },
    select: { slug: true },
  });
  for (const profile of profiles) taken.add(profile.slug);

  if (redirectTableExists) {
    const redirects = await prisma.slugRedirect.findMany({
      where: { oldSlug: { in: candidates } },
      select: { oldSlug: true },
    });
    for (const redirect of redirects) taken.add(redirect.oldSlug);
  }
  return taken;
}

type Mapping = { id: string; oldSlug: string; newSlug: string };

async function main() {
  const redirectTableExists = await slugRedirectTableExists();
  if (!redirectTableExists) {
    if (write) {
      throw new Error(
        "SlugRedirect table does not exist — apply the add_slug_redirects " +
          "migration before running with --write.",
      );
    }
    console.info(
      JSON.stringify({
        warning:
          "SlugRedirect table absent; skipping redirect collision check (dry-run only)",
      }),
    );
  }

  const totalTargets = await countTargets();
  console.info(
    JSON.stringify({
      mode: write ? "write" : "dry-run",
      totalTargets,
      batchSize,
      limit,
      cursor: initialCursor ?? null,
    }),
  );

  // Clean slugs claimed earlier in this run (write mode also lands them in the
  // DB per batch, but dry-run needs this to model cross-batch collisions).
  const assigned = new Set<string>();
  const samples: Mapping[] = [];
  const suffixHistogram = new Map<number, number>();

  let cursor = initialCursor;
  let scanned = 0;
  let planned = 0;
  let collisions = 0;
  let skipped = 0;
  let renamed = 0;
  let redirectsCreated = 0;

  while (limit === 0 || scanned < limit) {
    const take = limit === 0 ? batchSize : Math.min(batchSize, limit - scanned);
    const rows = await fetchBatch(cursor, take);
    if (rows.length === 0) break;

    // Resolve collisions in rounds: every pending row proposes a candidate,
    // we batch-check the DB, and losers bump their suffix for the next round.
    type Pending = { id: string; oldSlug: string; base: string; n: number };
    let pending: Pending[] = [];
    for (const row of rows) {
      const base = row.slug.replace(HASH_SLUG_REGEX, "");
      if (base.length === 0) {
        skipped += 1;
        console.warn(
          JSON.stringify({ skipped: row.slug, reason: "empty base slug" }),
        );
        continue;
      }
      if (GENERIC_BASES.has(base)) {
        skipped += 1;
        continue;
      }
      pending.push({ id: row.id, oldSlug: row.slug, base, n: 1 });
    }

    const mappings: Mapping[] = [];
    while (pending.length > 0) {
      const candidateOf = (p: Pending) =>
        p.n === 1 ? p.base : `${p.base}-${p.n}`;
      const candidates = [...new Set(pending.map(candidateOf))];
      const taken = await takenInDatabase(candidates, redirectTableExists);

      const stillPending: Pending[] = [];
      for (const p of pending) {
        const candidate = candidateOf(p);
        if (taken.has(candidate) || assigned.has(candidate)) {
          if (p.n >= MAX_SUFFIX) {
            skipped += 1;
            console.warn(
              JSON.stringify({
                skipped: p.oldSlug,
                reason: `no free slug within ${MAX_SUFFIX} suffixes`,
              }),
            );
            continue;
          }
          stillPending.push({ ...p, n: p.n + 1 });
          continue;
        }
        assigned.add(candidate);
        mappings.push({ id: p.id, oldSlug: p.oldSlug, newSlug: candidate });
        if (p.n > 1) collisions += 1;
        suffixHistogram.set(p.n, (suffixHistogram.get(p.n) ?? 0) + 1);
      }
      pending = stillPending;
    }

    planned += mappings.length;
    if (samples.length < sampleTarget) {
      samples.push(...mappings.slice(0, sampleTarget - samples.length));
    }

    if (write && mappings.length > 0) {
      // P1017 (server closed the connection) shows up when the pooled Neon
      // connection idles out during long skip-only stretches — reconnect and
      // retry rather than dying mid-run. skipDuplicates keeps retries safe.
      let createResult: { count: number } | undefined;
      for (let attempt = 1; ; attempt++) {
        try {
          [createResult] = await prisma.$transaction([
            prisma.slugRedirect.createMany({
              data: mappings.map((m) => ({
                oldSlug: m.oldSlug,
                creatorProfileId: m.id,
              })),
              skipDuplicates: true,
            }),
            ...mappings.map((m) =>
              prisma.creatorProfile.update({
                where: { id: m.id },
                data: { slug: m.newSlug },
              }),
            ),
          ]);
          break;
        } catch (err) {
          if (attempt >= 4) throw err;
          console.warn(
            JSON.stringify({
              retry: attempt,
              error:
                err instanceof Error ? err.message.split("\n")[0] : String(err),
            }),
          );
          await prisma.$disconnect().catch(() => {});
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
      redirectsCreated += createResult.count;
      renamed += mappings.length;
    }

    scanned += rows.length;
    cursor = rows.at(-1)!.id;
    console.info(
      JSON.stringify({
        scanned,
        planned,
        collisions,
        skipped,
        renamed,
        redirectsCreated,
        nextCursor: cursor,
      }),
    );

    if (rows.length < take) break;
    if (sleepMs > 0) await sleep(sleepMs);
  }

  if (!write && samples.length > 0) {
    console.info("sample mappings:");
    for (const sample of samples) {
      console.info(`  ${sample.oldSlug} -> ${sample.newSlug}`);
    }
  }

  console.info(
    JSON.stringify({
      complete: limit === 0,
      mode: write ? "write" : "dry-run",
      totalTargets,
      scanned,
      planned,
      collisions,
      collisionRate:
        planned > 0 ? Number(((collisions / planned) * 100).toFixed(2)) : 0,
      skipped,
      renamed,
      redirectsCreated,
      suffixHistogram: Object.fromEntries(
        [...suffixHistogram.entries()].sort((a, b) => a[0] - b[0]),
      ),
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
