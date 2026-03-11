/**
 * Cross-Platform Link Extraction & Identity Resolution Service
 *
 * Discovers social links from:
 *   1. Twitch channel bios/descriptions (HIGH confidence)
 *   2. YouTube channel descriptions (MEDIUM confidence)
 *   3. Fuzzy username matching across platforms (MEDIUM/LOW confidence)
 *
 * Usage: Import and call the service functions from workers or tRPC routers.
 */

import type { Platform } from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";

const log = createLogger("link-extraction");

// ============================================================
// TYPES
// ============================================================

export type LinkConfidence = "HIGH" | "MEDIUM" | "LOW";

export type LinkSource =
  | "twitch_bio"
  | "twitch_panels"
  | "youtube_about"
  | "fuzzy_match";

export type SocialLink = {
  platform: Platform;
  url: string;
  username: string;
  confidence: LinkConfidence;
  source: LinkSource;
};

// ============================================================
// URL EXTRACTION PATTERNS
// ============================================================

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
      /(?:https?:\/\/)?youtu\.be\/([\w-]+)/gi,
    ],
    usernameExtractor: (url: string): string | null => {
      const match =
        url.match(/youtube\.com\/(?:c\/|channel\/|user\/|@)([\w-]+)/i) ??
        url.match(/youtube\.com\/([\w-]+)/i);
      if (!match?.[1]) return null;
      const username = match[1];
      // Filter out common non-username paths
      const nonUsernames = [
        "watch",
        "playlist",
        "feed",
        "results",
        "shorts",
        "live",
        "gaming",
        "premium",
        "music",
      ];
      return nonUsernames.includes(username.toLowerCase()) ? null : username;
    },
  },
  {
    platform: "instagram",
    patterns: [/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([\w.]+)\/?/gi],
    usernameExtractor: (url: string): string | null => {
      const match = url.match(/instagram\.com\/([\w.]+)/i);
      if (!match?.[1]) return null;
      const username = match[1];
      const nonUsernames = [
        "p",
        "reel",
        "explore",
        "stories",
        "accounts",
        "directory",
      ];
      return nonUsernames.includes(username.toLowerCase()) ? null : username;
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
      const username = match[1];
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
      return nonUsernames.includes(username.toLowerCase()) ? null : username;
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
      const username = match[1];
      const nonUsernames = ["categories", "following", "browse"];
      return nonUsernames.includes(username.toLowerCase()) ? null : username;
    },
  },
];

// ============================================================
// CORE EXTRACTION FUNCTIONS
// ============================================================

/**
 * Extract social media links from any text (bio, description, about section).
 * Returns discovered links with platform identification and extracted usernames.
 */
export function extractSocialLinks(
  text: string,
  source: LinkSource,
  confidenceOverride?: LinkConfidence,
): SocialLink[] {
  if (!text || text.trim().length === 0) return [];

  const links: SocialLink[] = [];
  const seen = new Set<string>(); // Deduplicate by platform+username

  for (const platformConfig of PLATFORM_PATTERNS) {
    for (const pattern of platformConfig.patterns) {
      // Reset regex state (global flag)
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const fullMatch = match[0];
        const username = platformConfig.usernameExtractor(fullMatch);

        if (!username) continue;

        const key = `${platformConfig.platform}:${username.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Normalize URL
        let url = fullMatch;
        if (!url.startsWith("http")) {
          url = `https://${url}`;
        }

        const confidence = confidenceOverride ?? getSourceConfidence(source);

        links.push({
          platform: platformConfig.platform,
          url,
          username: username.toLowerCase(),
          confidence,
          source,
        });
      }
    }
  }

  return links;
}

function getSourceConfidence(source: LinkSource): LinkConfidence {
  switch (source) {
    case "twitch_panels":
      return "HIGH";
    case "twitch_bio":
      return "MEDIUM";
    case "youtube_about":
      return "MEDIUM";
    case "fuzzy_match":
      return "LOW";
  }
}

// ============================================================
// TWITCH BIO LINK EXTRACTION
// ============================================================

/**
 * Extract cross-platform links from a Twitch channel's bio/description.
 * The bio is available from the Helix /users endpoint.
 */
export function extractLinksFromTwitchBio(
  bio: string | null | undefined,
): SocialLink[] {
  if (!bio) return [];
  return extractSocialLinks(bio, "twitch_bio");
}

// ============================================================
// YOUTUBE DESCRIPTION LINK EXTRACTION
// ============================================================

/**
 * Extract cross-platform links from a YouTube channel description.
 */
export function extractLinksFromYouTubeAbout(
  description: string | null | undefined,
): SocialLink[] {
  if (!description) return [];
  return extractSocialLinks(description, "youtube_about");
}

// ============================================================
// YOUTUBE DATA API INTEGRATION
// ============================================================

type YouTubeChannel = {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    thumbnails: { default: { url: string } };
  };
};

/**
 * Fetch YouTube channel description and extract social links.
 * Costs 1 quota unit per call (YouTube Data API v3).
 */
export async function extractLinksFromYouTubeChannel(
  channelId: string,
): Promise<SocialLink[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    log.warn("YOUTUBE_API_KEY not set — skipping YouTube link extraction");
    return [];
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", channelId);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      log.error({ status: res.status }, "YouTube API error");
      return [];
    }

    const data = (await res.json()) as { items?: YouTubeChannel[] };
    const channel = data.items?.[0];
    if (!channel) return [];

    return extractLinksFromYouTubeAbout(channel.snippet.description);
  } catch (err) {
    log.error({ err }, "Failed to fetch YouTube channel");
    return [];
  }
}

// ============================================================
// FUZZY USERNAME MATCHING
// ============================================================

/**
 * Common platform suffixes/prefixes that creators use when their
 * preferred username is taken on another platform.
 */
const PLATFORM_SUFFIXES = [
  "tv",
  "yt",
  "ttv",
  "live",
  "gaming",
  "plays",
  "official",
  "real",
  "_tv",
  "_yt",
  "_ttv",
  "_live",
  "_gaming",
  "_plays",
  "_official",
  "TV",
  "YT",
  "TTV",
];

/**
 * Score how well two usernames match for cross-platform identity resolution.
 */
export function scoreUsernameMatch(
  sourceUsername: string,
  candidateUsername: string,
): LinkConfidence | null {
  const source = sourceUsername.toLowerCase().replace(/[_.-]/g, "");
  const candidate = candidateUsername.toLowerCase().replace(/[_.-]/g, "");

  // Exact match (after normalization)
  if (source === candidate) {
    return "HIGH";
  }

  // Check if candidate is source + platform suffix
  for (const suffix of PLATFORM_SUFFIXES) {
    const suffixLower = suffix.toLowerCase().replace(/_/g, "");
    if (candidate === source + suffixLower) {
      return "MEDIUM";
    }
    if (source === candidate + suffixLower) {
      return "MEDIUM";
    }
  }

  // Check if one contains the other (with significant overlap)
  if (source.length >= 4 && candidate.length >= 4) {
    if (candidate.includes(source) || source.includes(candidate)) {
      // Only if the shorter string is a significant portion (>60%) of the longer
      const shorter = source.length < candidate.length ? source : candidate;
      const longer = source.length < candidate.length ? candidate : source;
      if (shorter.length / longer.length > 0.6) {
        return "LOW";
      }
    }
  }

  return null; // No match
}

/**
 * Generate candidate usernames to search for on other platforms
 * based on a source username.
 */
export function generateCandidateUsernames(username: string): string[] {
  const base = username.toLowerCase();
  const candidates = new Set<string>();

  // The username itself
  candidates.add(base);

  // Without common suffixes (if present)
  for (const suffix of PLATFORM_SUFFIXES) {
    const suffixLower = suffix.toLowerCase();
    if (base.endsWith(suffixLower)) {
      candidates.add(base.slice(0, -suffixLower.length));
    }
    if (base.endsWith(`_${suffixLower}`)) {
      candidates.add(base.slice(0, -(suffixLower.length + 1)));
    }
  }

  // With common suffixes
  for (const suffix of ["tv", "yt", "ttv", "live"]) {
    candidates.add(`${base}${suffix}`);
    candidates.add(`${base}_${suffix}`);
  }

  return Array.from(candidates).filter((c) => c.length >= 3);
}

/**
 * Perform cross-platform username search and score matches.
 * Uses platform adapter search functions when available.
 *
 * @param sourceUsername - The username to search for
 * @param sourcePlatform - The platform the username is from (excluded from search)
 * @param searchFn - A function that searches a platform by query
 */
export async function findCrossPlatformMatches(
  sourceUsername: string,
  sourcePlatform: Platform,
  searchFn: (
    platform: Platform,
    query: string,
    limit: number,
  ) => Promise<{ platformUsername: string; platformUserId: string }[]>,
): Promise<SocialLink[]> {
  const results: SocialLink[] = [];
  const targetPlatforms: Platform[] = [
    "youtube",
    "instagram",
    "tiktok",
    "x",
    "kick",
  ].filter((p) => p !== sourcePlatform) as Platform[];

  const candidates = generateCandidateUsernames(sourceUsername);
  const seen = new Set<string>();

  for (const platform of targetPlatforms) {
    // Search with the primary username only (to conserve API calls)
    try {
      const searchResults = await searchFn(platform, sourceUsername, 5);

      for (const result of searchResults) {
        const key = `${platform}:${result.platformUsername.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const confidence = scoreUsernameMatch(
          sourceUsername,
          result.platformUsername,
        );

        if (confidence) {
          results.push({
            platform,
            url: buildPlatformUrl(platform, result.platformUsername),
            username: result.platformUsername.toLowerCase(),
            confidence,
            source: "fuzzy_match",
          });
        }
      }
    } catch (err) {
      log.warn(
        { platform, username: sourceUsername, err },
        "Cross-platform search failed",
      );
    }
  }

  return results;
}

function buildPlatformUrl(platform: Platform, username: string): string {
  switch (platform) {
    case "twitch":
      return `https://twitch.tv/${username}`;
    case "youtube":
      return `https://youtube.com/@${username}`;
    case "instagram":
      return `https://instagram.com/${username}`;
    case "tiktok":
      return `https://tiktok.com/@${username}`;
    case "x":
      return `https://x.com/${username}`;
    case "kick":
      return `https://kick.com/${username}`;
  }
}

// ============================================================
// BATCH PROCESSING HELPERS
// ============================================================

/**
 * Process link extraction for a creator profile, combining
 * all available sources.
 */
export async function extractAllLinksForCreator(options: {
  twitchBio?: string | null;
  youtubeChannelId?: string | null;
  twitchUsername?: string;
  sourcePlatform?: Platform;
  enableFuzzyMatch?: boolean;
  searchFn?: (
    platform: Platform,
    query: string,
    limit: number,
  ) => Promise<{ platformUsername: string; platformUserId: string }[]>;
}): Promise<SocialLink[]> {
  const allLinks: SocialLink[] = [];
  const seen = new Set<string>();

  const addUnique = (links: SocialLink[]) => {
    for (const link of links) {
      const key = `${link.platform}:${link.username}`;
      if (!seen.has(key)) {
        seen.add(key);
        allLinks.push(link);
      }
    }
  };

  // 1. Twitch bio links (highest priority from bio source)
  if (options.twitchBio) {
    addUnique(extractLinksFromTwitchBio(options.twitchBio));
  }

  // 2. YouTube description links
  if (options.youtubeChannelId) {
    const ytLinks = await extractLinksFromYouTubeChannel(
      options.youtubeChannelId,
    );
    addUnique(ytLinks);
  }

  // 3. Fuzzy username matching (lowest priority, most links)
  if (options.enableFuzzyMatch && options.twitchUsername && options.searchFn) {
    const fuzzyLinks = await findCrossPlatformMatches(
      options.twitchUsername,
      options.sourcePlatform ?? "twitch",
      options.searchFn,
    );
    addUnique(fuzzyLinks);
  }

  // Sort by confidence: HIGH first, then MEDIUM, then LOW
  const confidenceOrder: Record<LinkConfidence, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  allLinks.sort(
    (a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence],
  );

  return allLinks;
}

/**
 * Filter links by minimum confidence level.
 */
export function filterByConfidence(
  links: SocialLink[],
  minConfidence: LinkConfidence,
): SocialLink[] {
  const levels: Record<LinkConfidence, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };
  return links.filter((l) => levels[l.confidence] >= levels[minConfidence]);
}
