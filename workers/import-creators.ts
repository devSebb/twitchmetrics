/**
 * Import top live streamers from Twitch Helix API as CreatorProfile records.
 *
 * Usage:
 *   tsx workers/import-creators.ts              # Import top 100 live streamers
 *   tsx workers/import-creators.ts --limit 50   # Import top 50
 *   tsx workers/import-creators.ts --dry-run    # Preview without writing
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 100;
})();

const prisma = new PrismaClient();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";

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
  if (!res.ok) throw new Error(`Twitch API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function main() {
  console.log(`=== Twitch Creator Import ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Fetching top ${LIMIT} live streams...\n`);

  // Fetch top live streams (up to 100 per request)
  const batches = Math.ceil(LIMIT / 100);
  const streams: {
    user_id: string;
    user_login: string;
    user_name: string;
    viewer_count: number;
    game_name: string;
  }[] = [];

  let cursor: string | undefined;
  for (let i = 0; i < batches; i++) {
    const count = Math.min(100, LIMIT - streams.length);
    const url = `/streams?first=${count}${cursor ? `&after=${cursor}` : ""}`;
    const res = await twitchGet<{
      data: typeof streams;
      pagination: { cursor?: string };
    }>(url);
    streams.push(...res.data);
    cursor = res.pagination?.cursor;
    if (!cursor) break;
  }

  console.log(`Fetched ${streams.length} live streams.`);

  // Fetch user details in batches of 100
  const userIds = streams.map((s) => s.user_id);
  const users: {
    id: string;
    login: string;
    display_name: string;
    profile_image_url: string;
    description: string;
    view_count: number;
    broadcaster_type: string;
  }[] = [];

  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);
    const query = batch.map((id) => `id=${id}`).join("&");
    const res = await twitchGet<{ data: typeof users }>(`/users?${query}`);
    users.push(...res.data);
  }

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Fetch follower counts in batches of 1 (Twitch requires broadcaster_id per call)
  // Use channel info endpoint instead for efficiency
  const channelIds = streams.map((s) => s.user_id);
  const channels: { broadcaster_id: string; followers?: number }[] = [];

  // Get follower counts in batches using /channels/followers
  for (const id of channelIds) {
    try {
      const res = await twitchGet<{ total: number }>(
        `/channels/followers?broadcaster_id=${id}`,
      );
      channels.push({ broadcaster_id: id, followers: res.total });
    } catch {
      channels.push({ broadcaster_id: id, followers: 0 });
    }
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 50));
  }

  const followerMap = new Map(
    channels.map((c) => [c.broadcaster_id, c.followers ?? 0]),
  );

  console.log(`\nImporting ${streams.length} creators...\n`);

  let created = 0;
  let skipped = 0;

  for (const stream of streams) {
    const user = userMap.get(stream.user_id);
    if (!user) continue;

    const followers = followerMap.get(stream.user_id) ?? 0;
    const baseSlug = slugify(user.login || user.display_name);

    // Ensure unique slug
    let slug = baseSlug;
    let attempt = 0;
    while (!DRY_RUN) {
      const existing = await prisma.creatorProfile.findUnique({
        where: { slug },
      });
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    if (DRY_RUN) {
      console.log(
        `  [DRY RUN] Would create: ${user.display_name} (@${user.login}) — ${followers.toLocaleString()} followers`,
      );
      created++;
      continue;
    }

    try {
      await prisma.creatorProfile.create({
        data: {
          displayName: user.display_name,
          slug,
          primaryPlatform: "twitch",
          avatarUrl: user.profile_image_url || null,
          bio: user.description || null,
          totalFollowers: BigInt(followers),
          state: "unclaimed",
          snapshotTier:
            followers >= 1_000_000
              ? "tier1"
              : followers >= 100_000
                ? "tier2"
                : "tier3",
          platformAccounts: {
            create: {
              platform: "twitch",
              platformUserId: user.id,
              platformUsername: user.login,
              platformDisplayName: user.display_name,
              followerCount: BigInt(followers),
              isOAuthConnected: false,
            },
          },
        },
      });
      created++;
      if (created % 10 === 0) {
        console.log(`  Imported ${created} creators...`);
      }
    } catch (err) {
      console.warn(`  Skipped ${user.display_name}: ${(err as Error).message}`);
      skipped++;
    }
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
