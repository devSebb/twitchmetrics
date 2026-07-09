import { prisma, Prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { youtubeAdapter } from "@/server/adapters/youtube";
import { AdapterError, type CreatorProfileData } from "@/server/adapters/types";
import { extractLinksFromTwitchBio } from "@/server/services/link-extraction";
import { createLogger } from "@/lib/logger";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("youtube-crosslink-backfill");

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;
const DEFAULT_MAX_LOOKUPS = 300;
const MAX_REVIEW_CANDIDATES = 50;

type BackfillEventData = {
  limit?: number;
  dryRun?: boolean;
  maxYouTubeLookups?: number;
};

type CandidateSource =
  | "direct_bio_url"
  | "plain_bio_reference"
  | "twitch_username_guess"
  | "kick_username_guess"
  | "display_name_guess";

type Candidate = {
  username: string;
  source: CandidateSource;
  initialConfidence: "high" | "medium";
  evidence: string;
};

type ReviewCandidate = {
  creatorProfileId: string;
  slug: string;
  displayName: string;
  username: string;
  source: CandidateSource;
  reason: string;
};

type CrosslinkCreator = {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  platformAccounts: Array<{
    platform: "twitch" | "kick" | "youtube";
    platformUsername: string;
  }>;
};

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

function normalizeMaxLookups(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_LOOKUPS;
  }
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function normalizeCandidate(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/^@/, "")
    .replace(/[.,;:!?)]$/, "");

  if (cleaned.length < 3 || cleaned.length > 60) return null;
  if (!/^[A-Za-z0-9][\w.-]+$/.test(cleaned)) return null;
  return cleaned;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isExplicitYouTubeUrl(bio: string, extractedUrl: string): boolean {
  const lowerBio = bio.toLowerCase();
  const lowerUrl = extractedUrl.toLowerCase();
  return (
    lowerBio.includes(lowerUrl) ||
    (/youtube\.com\/(?:@|channel\/|c\/|user\/)/i.test(extractedUrl) &&
      lowerBio.includes("youtube.com"))
  );
}

function isChannelId(value: string): boolean {
  return /^UC[A-Za-z0-9_-]{20,}$/.test(value);
}

function addCandidate(
  candidates: Map<string, Candidate>,
  candidate: Candidate,
): void {
  const normalized = normalizeCandidate(candidate.username);
  if (!normalized) return;

  const key = normalized.toLowerCase();
  const existing = candidates.get(key);
  if (!existing || candidate.initialConfidence === "high") {
    candidates.set(key, { ...candidate, username: normalized });
  }
}

function handleVariants(username: string): string[] {
  const normalized = normalizeCandidate(username);
  if (!normalized) return [];

  const base = normalized.replace(/[_.-]/g, "");
  const variants = new Set([normalized, base]);
  for (const suffix of ["tv", "ttv", "live", "yt", "gaming"]) {
    if (
      base.toLowerCase().endsWith(suffix) &&
      base.length > suffix.length + 2
    ) {
      variants.add(base.slice(0, -suffix.length));
    }
  }

  return [...variants].filter((value) => value.length >= 3);
}

function buildCandidates(creator: CrosslinkCreator): Candidate[] {
  const candidates = new Map<string, Candidate>();
  const bio = creator.bio ?? "";

  for (const link of extractLinksFromTwitchBio(bio)) {
    if (link.platform !== "youtube") continue;

    const directUrl = isExplicitYouTubeUrl(bio, link.url);
    const channelId = isChannelId(link.username);
    addCandidate(candidates, {
      username: link.username,
      source: directUrl || channelId ? "direct_bio_url" : "plain_bio_reference",
      initialConfidence: directUrl || channelId ? "high" : "medium",
      evidence: link.url,
    });
  }

  const twitch = creator.platformAccounts.find(
    (account) => account.platform === "twitch",
  );
  const kick = creator.platformAccounts.find(
    (account) => account.platform === "kick",
  );

  if (twitch?.platformUsername) {
    for (const username of handleVariants(twitch.platformUsername)) {
      addCandidate(candidates, {
        username,
        source: "twitch_username_guess",
        initialConfidence: "medium",
        evidence: twitch.platformUsername,
      });
    }
  }

  if (kick?.platformUsername) {
    for (const username of handleVariants(kick.platformUsername)) {
      addCandidate(candidates, {
        username,
        source: "kick_username_guess",
        initialConfidence: "medium",
        evidence: kick.platformUsername,
      });
    }
  }

  for (const username of handleVariants(creator.displayName)) {
    addCandidate(candidates, {
      username,
      source: "display_name_guess",
      initialConfidence: "medium",
      evidence: creator.displayName,
    });
  }

  return [...candidates.values()];
}

function youtubeBioLinksBack(
  youtubeProfile: CreatorProfileData,
  creator: CrosslinkCreator,
): boolean {
  const bio = youtubeProfile.bio?.toLowerCase() ?? "";
  if (!bio) return false;

  for (const account of creator.platformAccounts) {
    if (account.platform !== "twitch" && account.platform !== "kick") continue;
    const username = account.platformUsername.toLowerCase();
    if (!username) continue;

    if (
      account.platform === "twitch" &&
      bio.includes(`twitch.tv/${username}`)
    ) {
      return true;
    }
    if (account.platform === "kick" && bio.includes(`kick.com/${username}`)) {
      return true;
    }
  }

  return false;
}

function displayNameMatches(
  youtubeProfile: CreatorProfileData,
  creator: CrosslinkCreator,
): boolean {
  const youtubeName = normalizeComparable(youtubeProfile.platformDisplayName);
  if (!youtubeName) return false;

  const names = [
    creator.displayName,
    creator.slug,
    ...creator.platformAccounts.map((account) => account.platformUsername),
  ].map(normalizeComparable);

  return names.some((name) => name.length >= 3 && name === youtubeName);
}

async function createYouTubeAccount(input: {
  creator: CrosslinkCreator;
  profile: CreatorProfileData;
}): Promise<"linked" | "conflict"> {
  const { creator, profile } = input;

  try {
    await prisma.platformAccount.create({
      data: {
        creatorProfileId: creator.id,
        platform: "youtube",
        platformUserId: profile.platformUserId,
        platformUsername: profile.platformUsername,
        platformDisplayName: profile.platformDisplayName,
        platformUrl: profile.platformUrl,
        platformAvatarUrl: profile.platformAvatarUrl,
        followerCount: profile.followerCount,
        subscriberCount: profile.followerCount,
        totalViews: profile.totalViews,
        postCount: profile.postCount,
        isOAuthConnected: false,
      },
    });
    return "linked";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "conflict";
    }
    throw error;
  }
}

export const youtubeCrosslinkBackfill = inngest.createFunction(
  { id: "youtube-crosslink-backfill", concurrency: { limit: 1 } },
  { event: "youtube/crosslink.backfill" },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as BackfillEventData;
    const limit = normalizeLimit(data.limit);
    const maxYouTubeLookups = normalizeMaxLookups(data.maxYouTubeLookups);
    const dryRun = data.dryRun === true;

    return executeIngestionRun(
      {
        domain: "creator",
        scope: "discovery",
        jobType: "youtube-crosslink-backfill",
        platform: "youtube",
      },
      async () => {
        const creators = (await step.run("fetch-twitch-kick-creators", () => {
          return prisma.creatorProfile.findMany({
            where: {
              AND: [
                { platformAccounts: { some: { platform: "twitch" } } },
                { platformAccounts: { some: { platform: "kick" } } },
                { platformAccounts: { none: { platform: "youtube" } } },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
            select: {
              id: true,
              slug: true,
              displayName: true,
              bio: true,
              platformAccounts: {
                where: { platform: { in: ["twitch", "kick"] } },
                select: {
                  platform: true,
                  platformUsername: true,
                },
              },
            },
          });
        })) as CrosslinkCreator[];

        const result = await step.run("resolve-and-link-youtube", async () => {
          let candidatesFound = 0;
          let verified = 0;
          let linked = 0;
          let conflicts = 0;
          let skippedLowConfidence = 0;
          let notFound = 0;
          let failed = 0;
          let youtubeLookupsUsed = 0;
          let lookupLimitReached = false;
          const reviewCandidates: ReviewCandidate[] = [];

          for (const creator of creators) {
            const candidates = buildCandidates(creator);
            candidatesFound += candidates.length;

            for (const candidate of candidates) {
              if (youtubeLookupsUsed >= maxYouTubeLookups) {
                lookupLimitReached = true;
                break;
              }

              youtubeLookupsUsed++;

              let profile: CreatorProfileData;
              try {
                profile = await youtubeAdapter.fetchProfile(candidate.username);
              } catch (error) {
                if (
                  error instanceof AdapterError &&
                  error.code === "not_found"
                ) {
                  notFound++;
                  continue;
                }

                failed++;
                log.warn(
                  {
                    creatorProfileId: creator.id,
                    slug: creator.slug,
                    username: candidate.username,
                    source: candidate.source,
                    err: error,
                  },
                  "YouTube candidate verification failed",
                );
                continue;
              }

              verified++;
              const highConfidence =
                candidate.initialConfidence === "high" ||
                youtubeBioLinksBack(profile, creator);

              if (!highConfidence) {
                skippedLowConfidence++;
                if (reviewCandidates.length < MAX_REVIEW_CANDIDATES) {
                  reviewCandidates.push({
                    creatorProfileId: creator.id,
                    slug: creator.slug,
                    displayName: creator.displayName,
                    username: candidate.username,
                    source: candidate.source,
                    reason: displayNameMatches(profile, creator)
                      ? "Verified channel with matching display name, but no direct profile link evidence."
                      : "Verified channel from a medium-confidence candidate, but no direct profile link evidence.",
                  });
                }
                continue;
              }

              if (dryRun) {
                linked++;
                break;
              }

              const createResult = await createYouTubeAccount({
                creator,
                profile,
              });
              if (createResult === "linked") {
                linked++;
                break;
              }

              conflicts++;
            }

            if (lookupLimitReached) break;
          }

          return {
            scanned: creators.length,
            candidatesFound,
            verified,
            linked,
            conflicts,
            skippedLowConfidence,
            notFound,
            failed,
            dryRun,
            youtubeLookupsUsed,
            maxYouTubeLookups,
            lookupLimitReached,
            reviewCandidates,
          };
        });

        log.info(result, "YouTube crosslink backfill complete");

        return {
          result,
          summary: {
            recordsScanned: result.scanned,
            recordsWritten: dryRun ? 0 : result.linked,
            recordsSkipped:
              result.skippedLowConfidence +
              result.conflicts +
              result.notFound +
              result.failed,
            recordsFailed: result.failed,
          },
        };
      },
      step,
    );
  },
);
