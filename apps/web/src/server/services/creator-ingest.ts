import { prisma } from "@twitchmetrics/database";
import { fetchUserDetailsByIds } from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";

const log = createLogger("creator-ingest");

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

export type IngestResult = {
  creatorProfileId: string;
  slug: string;
  alreadyExisted: boolean;
};

/**
 * Idempotently create a CreatorProfile from a Twitch user ID.
 *
 * Used by the search-fallback flow (when a user queries a creator that isn't
 * in our DB yet) and by admin tooling. Returns the existing profile if the
 * account is already tracked.
 */
export async function ingestCreatorByTwitchId(
  platformUserId: string,
): Promise<IngestResult | null> {
  // Short-circuit if we already have this account
  const existing = await prisma.platformAccount.findFirst({
    where: { platform: "twitch", platformUserId },
    select: {
      creatorProfileId: true,
      creatorProfile: { select: { slug: true } },
    },
  });
  if (existing) {
    return {
      creatorProfileId: existing.creatorProfileId,
      slug: existing.creatorProfile.slug,
      alreadyExisted: true,
    };
  }

  const [user] = await fetchUserDetailsByIds([platformUserId]);
  if (!user) {
    log.warn({ platformUserId }, "Twitch user not found");
    return null;
  }

  // Fetch follower count separately (Helix /users doesn't include it)
  let followers = 0;
  try {
    const { fetchProfile } = await import("@/server/adapters/twitch").then(
      (m) => ({ fetchProfile: m.twitchAdapter.fetchProfile }),
    );
    const profile = await fetchProfile(user.login);
    followers = Number(profile.followerCount ?? 0n);
  } catch {
    // Non-blocking — proceed with 0 and let the first snapshot fill it in
  }

  const baseSlug = slugify(user.login || user.displayName);
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

  const created = await prisma.creatorProfile.create({
    data: {
      displayName: user.displayName,
      slug,
      avatarUrl: user.avatarUrl || null,
      bio: user.bio || null,
      primaryPlatform: "twitch",
      state: "unclaimed",
      snapshotTier: tierFromFollowers(followers),
      totalFollowers: BigInt(followers),
      searchText: `${user.displayName} ${user.login}`.toLowerCase(),
      catalogSource: "twitch_api",
      listed: false,
      platformAccounts: {
        create: {
          platform: "twitch",
          platformUserId: user.id,
          platformUsername: user.login,
          platformDisplayName: user.displayName,
          platformAvatarUrl: user.avatarUrl || null,
          followerCount: BigInt(followers),
          isOAuthConnected: false,
        },
      },
    },
    select: { id: true, slug: true },
  });

  log.info({ creatorProfileId: created.id, slug }, "Ingested new creator");

  return {
    creatorProfileId: created.id,
    slug: created.slug,
    alreadyExisted: false,
  };
}
