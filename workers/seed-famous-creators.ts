/**
 * Seed a curated list of well-known Twitch creators into the DB.
 *
 * Discovery cron (`discoverCreators`) only picks up streamers who are
 * live at 06:00 UTC with ≥50 viewers — which misses famous creators who
 * stream outside that window (e.g. Ibai, Auronplay, xQc between sessions).
 * This worker resolves their current Twitch user IDs via Helix
 * `/users?login=<handle>` regardless of live status and creates profiles.
 *
 * Safe to re-run: existing creators are skipped.
 *
 * Usage:
 *   tsx workers/seed-famous-creators.ts                  # Seed the curated list
 *   tsx workers/seed-famous-creators.ts --dry-run        # Preview without writing
 *   tsx workers/seed-famous-creators.ts --file handles.txt  # Read handles from file (one per line)
 *   tsx workers/seed-famous-creators.ts --handles ibai,xqc # Comma-separated list
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FILE = (() => {
  const idx = args.indexOf("--file");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
})();
const HANDLES_ARG = (() => {
  const idx = args.indexOf("--handles");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
})();

const prisma = new PrismaClient();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";

// Curated list of famous / high-follower Twitch creators. Edit freely.
const DEFAULT_HANDLES = [
  // Spanish-speaking
  "ibai",
  "auronplay",
  "rubius",
  "elmariana",
  "illojuan",
  "juansguarnizo",
  "thegrefg",
  "westcol",
  "biyin_",
  "carola",
  "spreen",
  // English
  "xqc",
  "kaicenat",
  "jynxzi",
  "summit1g",
  "shroud",
  "pokimane",
  "sodapoppin",
  "lirik",
  "asmongold",
  "ludwig",
  "caseoh_",
  "hasanabi",
  "amouranth",
  "tyler1",
  "mizkif",
  "nmplol",
  "loltyler1",
  "emiru",
  "erobb221",
  "buddha",
  "tarik",
  "adinross",
  // Gaming / speedrun / variety
  "yoda",
  "roshtein",
  "trainwreckstv",
  "moistcr1tikal",
  // French
  "zerator",
  "domingo",
  "kameto",
  "gotaga",
  "squeezie",
  "mistermv",
  // Portuguese / Brazilian
  "gaules",
  "alanzoka",
  "cellbit",
  // German
  "montanablack88",
  "knossi",
  "papaplatte",
];

function getHandles(): string[] {
  if (FILE) {
    return readFileSync(FILE, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (HANDLES_ARG) {
    return HANDLES_ARG.split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  }
  return DEFAULT_HANDLES;
}

let appToken: string | null = null;

async function getAppToken(): Promise<string> {
  if (appToken) return appToken;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get app token: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  appToken = data.access_token;
  return appToken;
}

async function twitchGet<T>(path: string): Promise<T> {
  const token = await getAppToken();
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: {
      "Client-ID": CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Twitch ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

type TwitchUserRow = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  description: string;
};

async function fetchUsersByLogin(logins: string[]): Promise<TwitchUserRow[]> {
  const results: TwitchUserRow[] = [];
  for (let i = 0; i < logins.length; i += 100) {
    const batch = logins.slice(i, i + 100);
    const query = batch.map((l) => `login=${encodeURIComponent(l)}`).join("&");
    const res = await twitchGet<{ data: TwitchUserRow[] }>(`/users?${query}`);
    results.push(...res.data);
  }
  return results;
}

async function getFollowerCount(broadcasterId: string): Promise<number> {
  try {
    const res = await twitchGet<{ total: number }>(
      `/channels/followers?broadcaster_id=${broadcasterId}&first=1`,
    );
    return res.total ?? 0;
  } catch {
    return 0;
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function tierFromFollowers(followers: number): "tier1" | "tier2" | "tier3" {
  if (followers >= 1_000_000) return "tier1";
  if (followers >= 100_000) return "tier2";
  return "tier3";
}

async function main() {
  const handles = getHandles().map((h) => h.toLowerCase());
  console.log(`=== Seed Famous Creators ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Handles: ${handles.length}`);

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set.");
    process.exit(1);
  }

  const users = await fetchUsersByLogin(handles);
  const foundLogins = new Set(users.map((u) => u.login.toLowerCase()));
  const missing = handles.filter((h) => !foundLogins.has(h));
  if (missing.length > 0) {
    console.warn(`Unresolved handles: ${missing.join(", ")}`);
  }

  // Filter out creators we already have
  const existingAccounts = await prisma.platformAccount.findMany({
    where: {
      platform: "twitch",
      platformUserId: { in: users.map((u) => u.id) },
    },
    select: { platformUserId: true },
  });
  const existingIds = new Set(existingAccounts.map((a) => a.platformUserId));
  const toCreate = users.filter((u) => !existingIds.has(u.id));

  console.log(`Resolved: ${users.length}`);
  console.log(`Already tracked: ${existingIds.size}`);
  console.log(`To create: ${toCreate.length}\n`);

  let created = 0;
  let skipped = 0;

  for (const user of toCreate) {
    const followers = await getFollowerCount(user.id);
    await new Promise((r) => setTimeout(r, 60));

    if (DRY_RUN) {
      console.log(
        `  [DRY] ${user.display_name} (@${user.login}) — ${followers.toLocaleString()} followers`,
      );
      created++;
      continue;
    }

    const baseSlug = slugify(user.login || user.display_name);
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const conflict = await prisma.creatorProfile.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!conflict) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    try {
      await prisma.creatorProfile.create({
        data: {
          displayName: user.display_name,
          slug,
          avatarUrl: user.profile_image_url || null,
          bio: user.description || null,
          primaryPlatform: "twitch",
          state: "unclaimed",
          snapshotTier: tierFromFollowers(followers),
          totalFollowers: BigInt(followers),
          searchText: `${user.display_name} ${user.login}`.toLowerCase(),
          platformAccounts: {
            create: {
              platform: "twitch",
              platformUserId: user.id,
              platformUsername: user.login,
              platformDisplayName: user.display_name,
              platformAvatarUrl: user.profile_image_url || null,
              followerCount: BigInt(followers),
              isOAuthConnected: false,
            },
          },
        },
      });
      created++;
      console.log(
        `  ✓ ${user.display_name} (@${user.login}) — ${followers.toLocaleString()}`,
      );
    } catch (err) {
      skipped++;
      console.warn(
        `  ✗ ${user.display_name}: ${(err as Error).message.slice(0, 100)}`,
      );
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
