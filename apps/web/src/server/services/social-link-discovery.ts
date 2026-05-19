/**
 * Social Link Discovery Service
 *
 * Orchestrates cross-platform link extraction for a creator profile.
 * Extracts social links from bios, verifies via adapters where possible,
 * and creates PlatformAccount records for discovered accounts.
 */

import { prisma } from "@twitchmetrics/database";
import type { Platform } from "@twitchmetrics/database";
import { getAdapter } from "@/server/adapters";
import {
  extractSocialLinks,
  extractLinksFromTwitchBio,
  extractLinksFromYouTubeChannel,
  filterByConfidence,
  type LinkSource,
} from "@/server/services/link-extraction";
import { createLogger } from "@/lib/logger";

const log = createLogger("social-link-discovery");

// ============================================================
// TYPES
// ============================================================

type PlatformAccountInput = {
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
};

export type CreatorDiscoveryInput = {
  id: string;
  bio: string | null;
  primaryPlatform: Platform;
  platformAccounts: PlatformAccountInput[];
};

// ============================================================
// SEARCH TEXT HELPER
// ============================================================

function buildSearchText(
  displayName: string,
  slug: string,
  accounts: { platformUsername: string; platformDisplayName: string | null }[],
): string {
  const parts = [
    displayName,
    slug,
    ...accounts.map((a) => a.platformUsername).filter(Boolean),
    ...accounts.map((a) => a.platformDisplayName).filter((v) => v != null),
  ];
  return [...new Set(parts)].join(" ").toLowerCase();
}

// ============================================================
// CORE FUNCTION
// ============================================================

/**
 * Run social link discovery for a single creator.
 *
 * Extracts cross-platform links from the creator's bio, verifies them
 * via adapters where possible, and persists new PlatformAccount records.
 * Always updates lastLinkDiscoveryAt on success.
 */
export async function discoverLinksForCreator(
  creator: CreatorDiscoveryInput,
): Promise<{ linked: number; skipped: number }> {
  let linked = 0;
  let skipped = 0;

  // 1. Determine extraction source based on primary platform
  const source: LinkSource =
    creator.primaryPlatform === "youtube" ? "youtube_about" : "twitch_bio";

  // 2. Extract links from stored bio. Twitch bios get extra YouTube
  // "YouTube: handle" parsing because most imported creators are Twitch-first.
  const bioLinks = creator.bio
    ? source === "twitch_bio"
      ? extractLinksFromTwitchBio(creator.bio)
      : extractSocialLinks(creator.bio, source)
    : [];

  // 3. For YouTube creators, also fetch fresh channel description (1 quota unit)
  let ytLinks: ReturnType<typeof extractSocialLinks> = [];
  if (creator.primaryPlatform === "youtube") {
    const ytAccount = creator.platformAccounts.find(
      (a) => a.platform === "youtube",
    );
    if (ytAccount) {
      ytLinks = await extractLinksFromYouTubeChannel(ytAccount.platformUserId);
    }
  }

  // 4. Merge, deduplicate, and filter to MEDIUM+ confidence
  const seen = new Set<string>();
  const allLinks: typeof bioLinks = [];
  for (const link of [...bioLinks, ...ytLinks]) {
    const key = `${link.platform}:${link.username.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      allLinks.push(link);
    }
  }
  const qualified = filterByConfidence(allLinks, "MEDIUM");

  if (qualified.length === 0) {
    await prisma.creatorProfile.update({
      where: { id: creator.id },
      data: { lastLinkDiscoveryAt: new Date() },
    });
    return { linked: 0, skipped: 0 };
  }

  // 5. Build set of already-linked platforms to avoid duplicates
  const existingPlatforms = new Set(
    creator.platformAccounts.map((a) => a.platform),
  );

  for (const link of qualified) {
    if (existingPlatforms.has(link.platform)) {
      skipped++;
      continue;
    }

    // 6. Attempt adapter verification to enrich the record
    let platformUserId = link.username;
    let followerCount: bigint | null = null;
    let subscriberCount: bigint | null = null;
    let totalViews: bigint | null = null;
    let postCount: number | null = null;
    let platformDisplayName: string | null = null;
    let avatarUrl: string | null = null;
    let verifiedUrl: string | null = link.url;
    let verified = false;

    const adapter = getAdapter(link.platform);
    if (adapter) {
      try {
        const profile = await adapter.fetchProfile(link.username);
        platformUserId = profile.platformUserId;
        followerCount = profile.followerCount ?? null;
        subscriberCount =
          link.platform === "youtube" ? (profile.followerCount ?? null) : null;
        totalViews = profile.totalViews ?? null;
        postCount = profile.postCount ?? null;
        platformDisplayName = profile.platformDisplayName ?? null;
        avatarUrl = profile.platformAvatarUrl ?? null;
        verifiedUrl = profile.platformUrl ?? link.url;
        verified = true;
      } catch (err) {
        log.warn(
          { platform: link.platform, username: link.username, err },
          "Adapter verification failed during social-link discovery",
        );
      }
    }

    if (link.platform === "youtube" && !verified) {
      skipped++;
      continue;
    }

    // 7. Create PlatformAccount (skip on unique constraint violations)
    try {
      await prisma.platformAccount.create({
        data: {
          creatorProfileId: creator.id,
          platform: link.platform,
          platformUserId,
          platformUsername: link.username,
          platformDisplayName,
          platformUrl: verifiedUrl,
          platformAvatarUrl: avatarUrl,
          followerCount,
          subscriberCount,
          totalViews,
          postCount,
          isOAuthConnected: false,
        },
      });
      existingPlatforms.add(link.platform);
      linked++;
      log.info(
        {
          creatorId: creator.id,
          platform: link.platform,
          username: link.username,
        },
        "Linked platform account",
      );
    } catch (err) {
      // Unique constraint: account already linked to another creator
      log.warn(
        { platform: link.platform, username: link.username, err },
        "Could not create PlatformAccount (likely duplicate)",
      );
      skipped++;
    }
  }

  // 8. Update searchText if new accounts were linked, always set lastLinkDiscoveryAt
  if (linked > 0) {
    const profile = await prisma.creatorProfile.findUnique({
      where: { id: creator.id },
      select: {
        displayName: true,
        slug: true,
        platformAccounts: {
          select: { platformUsername: true, platformDisplayName: true },
        },
      },
    });

    if (profile) {
      const searchText = buildSearchText(
        profile.displayName,
        profile.slug,
        profile.platformAccounts,
      );
      await prisma.creatorProfile.update({
        where: { id: creator.id },
        data: { searchText, lastLinkDiscoveryAt: new Date() },
      });
    }
  } else {
    await prisma.creatorProfile.update({
      where: { id: creator.id },
      data: { lastLinkDiscoveryAt: new Date() },
    });
  }

  return { linked, skipped };
}
