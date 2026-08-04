import type { PrismaClient } from "@twitchmetrics/database";
import { legacyIngestLimiter } from "@/lib/redis";
import { createLogger } from "@/lib/logger";
import { cacheGet, cacheSet } from "@/server/services/cache";

const log = createLogger("legacy-redirects");

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

/** Confirmed-dead Twitch IDs are negative-cached to avoid repeat API calls. */
const INGEST_MISS_TTL = 7 * 24 * 3600;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

// Per-instance fallback when Redis is unreachable: still bounds Twitch API
// usage (per serverless instance) instead of disabling self-heal entirely.
let memoryWindowStart = 0;
let memoryWindowCount = 0;
function memoryRateLimit(limit: number): boolean {
  const now = Date.now();
  if (now - memoryWindowStart > 60_000) {
    memoryWindowStart = now;
    memoryWindowCount = 0;
  }
  memoryWindowCount += 1;
  return memoryWindowCount <= limit;
}

/**
 * Catalog self-heal: when a legacy /c/ URL carries a Twitch ID we don't have,
 * ingest the channel live from the Twitch API (creates an unlisted profile)
 * and redirect to it. Guardrails, in order:
 *   1. sane numeric ID only (no API call for garbage)
 *   2. negative cache — a confirmed-dead ID is not re-checked for 7 days
 *   3. global rate limit (30/min) — a crawler storm on dead legacy URLs
 *      degrades to plain 404s instead of burning Twitch quota / DB writes;
 *      those URLs recover on a later crawl. Fails closed if Redis is down.
 * Returns the new (or raced-concurrent) slug, or null.
 */
export async function ingestLegacyChannelGuarded(
  segment: string,
): Promise<string | null> {
  const platformUserId = LEGACY_SEGMENT.exec(segment)?.[1];
  if (!platformUserId || platformUserId.length > 12) return null;

  const missKey = `legacy:ingest-miss:${platformUserId}`;
  try {
    if (await withTimeout(cacheGet<number>(missKey), 1500)) return null;
  } catch {
    // Cache unreachable — proceed; the rate limit still bounds API usage.
  }

  let allowed: boolean;
  try {
    allowed = (await withTimeout(legacyIngestLimiter.limit("global"), 1500))
      .success;
  } catch {
    allowed = memoryRateLimit(30);
  }
  if (!allowed) return null;

  try {
    const { ingestCreatorByTwitchId } = await import("./creator-ingest");
    const result = await ingestCreatorByTwitchId(platformUserId);
    if (!result) {
      await cacheSet(missKey, 1, INGEST_MISS_TTL);
      return null;
    }
    return result.slug;
  } catch (err) {
    log.warn({ err, platformUserId }, "Legacy on-miss ingestion failed");
    return null;
  }
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
  viewership: "/creators?sort=viewership",
  follower: "/creators",
  growth: "/creators?sort=trending",
  peak: "/creators?sort=peak",
  popularity: "/creators",
  most_watched: "/creators?sort=viewership",
  most_followed: "/creators",
  fastest_growing: "/creators?sort=trending",
};

/** Standard cache policy for legacy 301s: CDN absorbs repeat crawler hits. */
export const LEGACY_REDIRECT_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=604800";
