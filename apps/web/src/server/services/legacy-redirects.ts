import type { PrismaClient } from "@twitchmetrics/database";

/**
 * Resolution for legacy twitchmetrics.net (Rails) URLs.
 *
 * Old URL shapes (canonical host was www.twitchmetrics.net):
 *   /c/<twitchID>-<login>            channel page — the numeric ID is
 *   /c/<twitchID>                    authoritative; the old app ignored the
 *   /c/<twitchID>-<wrong-login>      trailing slug and 301'd to the right one
 *   /c/<...>/{streams,videos,clips,emotes}   sub-tabs
 *   /g/<twitchGameID>-<slug>         game page
 *   /channels/{viewership,follower,growth,peak,popularity}[?game=Name]
 *   /games/{viewership,peak,played,popularity}
 *   /kick_channels/{viewership,peak,popularity}
 *   /overviews/{twitch,kick}
 *
 * The numeric prefix maps to PlatformAccount.platformUserId (unique per
 * platform); the game ID maps to Game.twitchGameId (unique).
 */

const LEGACY_SEGMENT = /^(\d+)(?:-(.*))?$/;

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Resolve a legacy /c/ path segment to a current creator slug.
 * Returns the canonical slug (merge pointers followed) or null.
 */
export async function resolveLegacyChannel(
  db: PrismaClient,
  segment: string,
): Promise<string | null> {
  const match = LEGACY_SEGMENT.exec(segment);
  const platformUserId = match?.[1];
  const login = match?.[2] ?? (match ? undefined : segment);

  const creatorSelect = {
    creatorProfile: {
      select: {
        slug: true,
        mergedInto: { select: { slug: true } },
      },
    },
  } as const;

  if (platformUserId) {
    // Old /c/ URLs were Twitch-only, but kick IDs are numeric too — prefer
    // twitch, fall back to kick so a stray kick-era link still lands.
    for (const platform of ["twitch", "kick"] as const) {
      const account = await db.platformAccount.findUnique({
        where: { platform_platformUserId: { platform, platformUserId } },
        select: creatorSelect,
      });
      const profile = account?.creatorProfile;
      if (profile) return profile.mergedInto?.slug ?? profile.slug;
    }
  }

  // ID miss (channel not in catalog under that ID) — the trailing login is
  // still a strong signal. Old logins are case-insensitive usernames.
  if (login) {
    const account = await db.platformAccount.findFirst({
      where: {
        platform: "twitch",
        platformUsername: { equals: login, mode: "insensitive" },
      },
      orderBy: { followerCount: { sort: "desc", nulls: "last" } },
      select: creatorSelect,
    });
    const profile = account?.creatorProfile;
    if (profile) return profile.mergedInto?.slug ?? profile.slug;
  }

  return null;
}

/**
 * Resolve a legacy /g/ path segment to a current game slug.
 */
export async function resolveLegacyGame(
  db: PrismaClient,
  segment: string,
): Promise<string | null> {
  const match = LEGACY_SEGMENT.exec(segment);
  const twitchGameId = match?.[1];
  const slug = match?.[2] ?? (match ? undefined : segment);

  if (twitchGameId) {
    const game = await db.game.findUnique({
      where: { twitchGameId },
      select: { slug: true },
    });
    if (game) return game.slug;
  }

  // Old slugs use the same slugify scheme as ours, so a direct match is likely.
  if (slug) {
    const game = await db.game.findUnique({
      where: { slug },
      select: { slug: true },
    });
    if (game) return game.slug;
  }

  return null;
}

/**
 * Resolve the ?game= query param on legacy ranking pages ("Just Chatting",
 * "League of Legends") to a current game slug.
 */
export async function resolveLegacyGameName(
  db: PrismaClient,
  name: string,
): Promise<string | null> {
  const bySlug = await db.game.findUnique({
    where: { slug: slugifyName(name) },
    select: { slug: true },
  });
  if (bySlug) return bySlug.slug;

  const byName = await db.game.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { slug: true },
  });
  return byName?.slug ?? null;
}

/**
 * Legacy /channels/<list> ranking pages → current /creators views.
 * The last three are older-era aliases kept as cheap insurance for
 * long-lived backlinks.
 */
export const LEGACY_CHANNEL_LISTS: Record<string, string> = {
  viewership: "/creators",
  follower: "/creators",
  growth: "/creators?sort=trending",
  peak: "/creators",
  popularity: "/creators",
  most_watched: "/creators",
  most_followed: "/creators",
  fastest_growing: "/creators?sort=trending",
};

/** Standard cache policy for legacy 301s: CDN absorbs repeat crawler hits. */
export const LEGACY_REDIRECT_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=604800";
