/**
 * Social Link Discovery Worker
 *
 * Backfills cross-platform social links for existing creators by extracting
 * URLs from their stored bios and creating PlatformAccount records.
 *
 * Usage:
 *   tsx workers/discover-social-links.ts               # Process all eligible
 *   tsx workers/discover-social-links.ts --dry-run     # Log without writing
 *   tsx workers/discover-social-links.ts --limit 50    # Max 50 creators
 *   tsx workers/discover-social-links.ts --force       # Re-process all (ignore lastLinkDiscoveryAt)
 */

import { PrismaClient, type Platform } from "@prisma/client";
import { normalizePlatformUrlForStorage } from "../apps/web/src/lib/platform-profile-url";

// ============================================================
// CONFIGURATION
// ============================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1]!, 10) : 0;
})();

const BATCH_SIZE = 50;
const PAUSE_BETWEEN_BATCHES_MS = 2000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const prisma = new PrismaClient();

// ============================================================
// LOGGING (lightweight — workers don't use pino)
// ============================================================

function log(
  level: "info" | "warn" | "error",
  msg: string,
  data?: Record<string, unknown>,
) {
  const ts = new Date().toISOString();
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console[level](`[${ts}] [discover-social-links] ${msg}${extra}`);
}

// ============================================================
// INLINE LINK EXTRACTION (avoids path alias issues in workers)
// ============================================================

type LinkConfidence = "HIGH" | "MEDIUM" | "LOW";

type SocialLink = {
  platform: Platform;
  url: string;
  username: string;
  confidence: LinkConfidence;
};

type PlatformPattern = {
  platform: Platform;
  patterns: RegExp[];
  usernameExtractor: (url: string) => string | null;
};

const PLATFORM_PATTERNS: PlatformPattern[] = [
  {
    platform: "youtube",
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/|@)([\w-]+)/gi,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/([\w-]+)/gi,
    ],
    usernameExtractor: (url: string): string | null => {
      const match =
        url.match(/youtube\.com\/(?:c\/|channel\/|user\/|@)([\w-]+)/i) ??
        url.match(/youtube\.com\/([\w-]+)/i);
      if (!match?.[1]) return null;
      const nonUsernames = [
        "watch",
        "playlist",
        "feed",
        "results",
        "shorts",
        "live",
        "gaming",
      ];
      return nonUsernames.includes(match[1]!.toLowerCase()) ? null : match[1]!;
    },
  },
  {
    platform: "instagram",
    patterns: [/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([\w.]+)\/?/gi],
    usernameExtractor: (url: string): string | null => {
      const match = url.match(/instagram\.com\/([\w.]+)/i);
      if (!match?.[1]) return null;
      const nonUsernames = ["p", "reel", "explore", "stories", "accounts"];
      return nonUsernames.includes(match[1]!.toLowerCase()) ? null : match[1]!;
    },
  },
  {
    platform: "x",
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([\w]+)\/?/gi,
    ],
    usernameExtractor: (url: string): string | null => {
      const match = url.match(/(?:twitter\.com|x\.com)\/([\w]+)/i);
      if (!match?.[1]) return null;
      const nonUsernames = [
        "home",
        "explore",
        "search",
        "notifications",
        "messages",
        "settings",
        "i",
        "hashtag",
      ];
      return nonUsernames.includes(match[1]!.toLowerCase()) ? null : match[1]!;
    },
  },
  {
    platform: "tiktok",
    patterns: [/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([\w.]+)\/?/gi],
    usernameExtractor: (url: string): string | null => {
      const match = url.match(/tiktok\.com\/@([\w.]+)/i);
      return match?.[1] ?? null;
    },
  },
  {
    platform: "kick",
    patterns: [/(?:https?:\/\/)?(?:www\.)?kick\.com\/([\w]+)\/?/gi],
    usernameExtractor: (url: string): string | null => {
      const match = url.match(/kick\.com\/([\w]+)/i);
      if (!match?.[1]) return null;
      const nonUsernames = ["categories", "following", "browse"];
      return nonUsernames.includes(match[1]!.toLowerCase()) ? null : match[1]!;
    },
  },
];

function extractLinksFromBio(bio: string): SocialLink[] {
  if (!bio || bio.trim().length === 0) return [];

  const links: SocialLink[] = [];
  const seen = new Set<string>();

  for (const platformConfig of PLATFORM_PATTERNS) {
    for (const pattern of platformConfig.patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(bio)) !== null) {
        const fullMatch = match[0]!;
        const username = platformConfig.usernameExtractor(fullMatch);
        if (!username) continue;

        const key = `${platformConfig.platform}:${username.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const url = fullMatch.startsWith("http")
          ? fullMatch
          : `https://${fullMatch}`;
        links.push({
          platform: platformConfig.platform,
          url,
          username: username.toLowerCase(),
          confidence: "MEDIUM",
        });
      }
    }
  }

  return links;
}

// ============================================================
// PLATFORM VERIFICATION (inline — no path alias)
// ============================================================

type VerifiedAccount = {
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string | null;
  platformUrl: string | null;
  platformAvatarUrl: string | null;
  followerCount: bigint | null;
  postCount: number | null;
};

async function verifyYouTubeAccount(
  handle: string,
): Promise<VerifiedAccount | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const cleanHandle = handle.replace(/^@/, "");

  for (const param of ["forHandle", "forUsername"] as const) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.searchParams.set("part", "snippet,statistics");
      url.searchParams.set(param, cleanHandle);
      url.searchParams.set("key", apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) continue;

      const data = (await res.json()) as {
        items?: Array<{
          id: string;
          snippet: {
            title: string;
            customUrl?: string;
            thumbnails: { high?: { url: string }; default?: { url: string } };
          };
          statistics: {
            subscriberCount?: string;
            videoCount?: string;
            hiddenSubscriberCount: boolean;
          };
        }>;
      };

      const channel = data.items?.[0];
      if (!channel) continue;

      return {
        platformUserId: channel.id,
        platformUsername: (
          channel.snippet.customUrl ?? cleanHandle
        ).toLowerCase(),
        platformDisplayName: channel.snippet.title ?? null,
        platformUrl: `https://youtube.com/${channel.snippet.customUrl ?? `channel/${channel.id}`}`,
        platformAvatarUrl:
          channel.snippet.thumbnails.high?.url ??
          channel.snippet.thumbnails.default?.url ??
          null,
        followerCount: channel.statistics.hiddenSubscriberCount
          ? null
          : channel.statistics.subscriberCount
            ? BigInt(channel.statistics.subscriberCount)
            : null,
        postCount: channel.statistics.videoCount
          ? parseInt(channel.statistics.videoCount, 10)
          : null,
      };
    } catch {
      continue;
    }
  }

  return null;
}

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
// MAIN PROCESSING LOGIC
// ============================================================

type CreatorRecord = {
  id: string;
  displayName: string;
  slug: string;
  bio: string | null;
  platformAccounts: {
    platform: Platform;
    platformUserId: string;
    platformUsername: string;
    platformDisplayName: string | null;
  }[];
};

async function processCreator(
  creator: CreatorRecord,
): Promise<{ linked: number; skipped: number }> {
  let linked = 0;
  let skipped = 0;

  if (!creator.bio) {
    if (!DRY_RUN) {
      await prisma.creatorProfile.update({
        where: { id: creator.id },
        data: { lastLinkDiscoveryAt: new Date() },
      });
    }
    return { linked: 0, skipped: 0 };
  }

  const links = extractLinksFromBio(creator.bio);
  const existingPlatforms = new Set(
    creator.platformAccounts.map((a) => a.platform),
  );

  for (const link of links) {
    if (existingPlatforms.has(link.platform)) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      log("info", "DRY RUN — would link account", {
        creator: creator.slug,
        platform: link.platform,
        username: link.username,
        url: link.url,
      });
      existingPlatforms.add(link.platform);
      linked++;
      continue;
    }

    // For YouTube, resolve the real channel ID before creating the account
    let platformUserId = link.username;
    let platformUsername = link.username;
    let platformDisplayName: string | null = null;
    let platformUrl: string | null = normalizePlatformUrlForStorage(
      link.platform,
      link.url,
    );
    let platformAvatarUrl: string | null = null;
    let followerCount: bigint | null = null;
    let postCount: number | null = null;

    if (link.platform === "youtube") {
      const verified = await verifyYouTubeAccount(link.username);
      if (verified) {
        platformUserId = verified.platformUserId;
        platformUsername = verified.platformUsername;
        platformDisplayName = verified.platformDisplayName;
        platformUrl = verified.platformUrl;
        platformAvatarUrl = verified.platformAvatarUrl;
        followerCount = verified.followerCount;
        postCount = verified.postCount;
        log("info", "YouTube channel verified", {
          creator: creator.slug,
          handle: link.username,
          channelId: platformUserId,
        });
      } else {
        log(
          "warn",
          "YouTube verification failed — skipping (channel ID unknown)",
          {
            creator: creator.slug,
            username: link.username,
          },
        );
        skipped++;
        continue;
      }
    }

    try {
      await prisma.platformAccount.create({
        data: {
          creatorProfileId: creator.id,
          platform: link.platform,
          platformUserId,
          platformUsername,
          platformDisplayName,
          platformUrl,
          platformAvatarUrl,
          followerCount,
          postCount,
          isOAuthConnected: false,
        },
      });
      existingPlatforms.add(link.platform);
      linked++;
      log("info", "Linked platform account", {
        creator: creator.slug,
        platform: link.platform,
        username: platformUsername,
      });
    } catch {
      skipped++;
    }
  }

  if (!DRY_RUN) {
    if (linked > 0) {
      // Refresh platformAccounts to get newly created ones for searchText
      const updated = await prisma.creatorProfile.findUnique({
        where: { id: creator.id },
        select: {
          displayName: true,
          slug: true,
          platformAccounts: {
            select: { platformUsername: true, platformDisplayName: true },
          },
        },
      });
      if (updated) {
        const searchText = buildSearchText(
          updated.displayName,
          updated.slug,
          updated.platformAccounts,
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
  }

  return { linked, skipped };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log("info", "Starting social link discovery", { DRY_RUN, FORCE, LIMIT });

  // Build query filter
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  // Only discover links for creators that have a Twitch account — the canonical
  // entry point. This prevents linking YouTube-only profiles and keeps discovery
  // grounded in verified Twitch identities.
  const withTwitch = {
    platformAccounts: { some: { platform: "twitch" as Platform } },
  };
  const whereClause = FORCE
    ? withTwitch
    : {
        ...withTwitch,
        OR: [
          { lastLinkDiscoveryAt: null },
          { lastLinkDiscoveryAt: { lt: thirtyDaysAgo } },
        ],
      };

  const creators = await prisma.creatorProfile.findMany({
    where: whereClause,
    select: {
      id: true,
      displayName: true,
      slug: true,
      bio: true,
      platformAccounts: {
        select: {
          platform: true,
          platformUserId: true,
          platformUsername: true,
          platformDisplayName: true,
        },
      },
    },
    orderBy: { lastLinkDiscoveryAt: "asc" },
    take: LIMIT > 0 ? LIMIT : undefined,
  });

  log("info", `Found ${creators.length} eligible creators`);

  let total = 0;
  let totalLinked = 0;
  let totalSkipped = 0;
  let errors = 0;

  for (let i = 0; i < creators.length; i += BATCH_SIZE) {
    const batch = creators.slice(i, i + BATCH_SIZE);

    for (const creator of batch) {
      try {
        const result = await processCreator(creator);
        totalLinked += result.linked;
        totalSkipped += result.skipped;
        total++;
      } catch (err) {
        errors++;
        log("error", `Failed to process creator ${creator.slug}`, {
          error: String(err),
        });
      }
    }

    if (i + BATCH_SIZE < creators.length) {
      log("info", `Batch complete, pausing ${PAUSE_BETWEEN_BATCHES_MS}ms...`, {
        processed: total,
        linked: totalLinked,
      });
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
    }
  }

  log("info", "Social link discovery complete", {
    total,
    linked: totalLinked,
    skipped: totalSkipped,
    errors,
    dryRun: DRY_RUN,
  });
}

main()
  .catch((err) => {
    log("error", "Worker failed", { error: String(err) });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
