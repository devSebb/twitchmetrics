/**
 * One-off catalog hygiene found by the 2026-08-16 data healthcheck.
 *
 *   --orphaned-api-profiles   discover-creators profiles created 2026-07-11 →
 *                             07-22 (between the `listed` migration and the
 *                             discover fix) have catalogSource NULL and
 *                             listed=false — Fanum (3.98M), Replays, T-Pain…
 *                             are invisible in browse. Stamp them
 *                             catalogSource='twitch_api', listed=true, exactly
 *                             what discover-creators writes today.
 *   --seed-profiles           Faker-generated dev seed rows that leaked into
 *                             prod (2026-03-24: "Muriel8", "Helga.Heaney",
 *                             "Lilla.Collins", "Iva_Smitham-Casper") — listed
 *                             with fake multi-million follower counts. Delete
 *                             (cascade removes accounts/snapshots).
 *
 * Dry-run by default; `--write` applies. Both modes are idempotent.
 *
 * Usage: pnpm worker:repair-catalog-anomalies -- --orphaned-api-profiles --seed-profiles [--write]
 */
import { prisma } from "@twitchmetrics/database";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const DO_ORPHANS = args.includes("--orphaned-api-profiles");
const DO_SEEDS = args.includes("--seed-profiles");

const FAKER_AVATAR_HOSTS =
  /faker-js|avatars\.githubusercontent\.com|cloudflare-ipfs\.com|picsum\.photos|loremflickr\.com/;

function log(msg: string, data?: unknown) {
  const payload =
    data === undefined
      ? ""
      : " " +
        JSON.stringify(data, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );
  console.log(
    `[${new Date().toISOString()}] [repair-catalog-anomalies] ${msg}${payload}`,
  );
}

async function orphanedApiProfiles() {
  const rows = await prisma.creatorProfile.findMany({
    where: {
      catalogSource: null,
      mergedIntoId: null,
      primaryPlatform: "twitch",
      platformAccounts: {
        some: { platform: "twitch", discoverySource: null },
      },
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      totalFollowers: true,
      listed: true,
      createdAt: true,
    },
    orderBy: { totalFollowers: "desc" },
  });
  log(`orphaned api-born profiles (catalogSource NULL): ${rows.length}`, {
    unlisted: rows.filter((r) => !r.listed).length,
    createdRange: rows.length
      ? [
          rows.reduce(
            (a, r) => (r.createdAt < a ? r.createdAt : a),
            rows[0]!.createdAt,
          ),
          rows.reduce(
            (a, r) => (r.createdAt > a ? r.createdAt : a),
            rows[0]!.createdAt,
          ),
        ]
      : null,
    top: rows
      .slice(0, 8)
      .map((r) => `${r.slug} ${r.displayName} ${r.totalFollowers}`),
  });
  if (!WRITE || rows.length === 0) return;
  const res = await prisma.creatorProfile.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { catalogSource: "twitch_api", listed: true },
  });
  log(`stamped catalogSource=twitch_api, listed=true`, { updated: res.count });
}

async function seedProfiles() {
  const rows = await prisma.creatorProfile.findMany({
    where: {
      state: "unclaimed",
      userId: null,
      catalogSource: { not: "streamhatchet" },
      createdAt: { lt: new Date("2026-04-01T00:00:00Z") },
      platformAccounts: { every: { lastSyncedAt: null } },
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      totalFollowers: true,
      avatarUrl: true,
      listed: true,
      createdAt: true,
      platformAccounts: {
        select: { platform: true, platformUsername: true, platformUrl: true },
      },
    },
  });
  const seeds = rows.filter(
    (r) => r.avatarUrl != null && FAKER_AVATAR_HOSTS.test(r.avatarUrl),
  );
  log(
    `seed-looking profiles (never synced, pre-April, faker avatar host): ${seeds.length}`,
    {
      candidatesScanned: rows.length,
      seeds: seeds.map(
        (r) =>
          `${r.slug} "${r.displayName}" ${r.totalFollowers} ${r.avatarUrl}`,
      ),
    },
  );
  if (!WRITE || seeds.length === 0) return;
  const res = await prisma.creatorProfile.deleteMany({
    where: { id: { in: seeds.map((r) => r.id) } },
  });
  log(`deleted seed profiles`, { deleted: res.count });
}

async function main() {
  if (!DO_ORPHANS && !DO_SEEDS) {
    console.error(
      "nothing to do: pass --orphaned-api-profiles and/or --seed-profiles",
    );
    process.exitCode = 2;
    return;
  }
  log(`start mode=${WRITE ? "WRITE" : "dry-run"}`);
  if (DO_ORPHANS) await orphanedApiProfiles();
  if (DO_SEEDS) await seedProfiles();
  log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
