/**
 * Identity resolver — proposes cross-platform links between solo profiles.
 *
 * Interim strategy (until SH ships the creator ES DB / contact_id): the trust
 * tiers, high to low, are contact_id (future) > admin > oauth > bio_link >
 * handle_match. This resolver produces the two bottom, automatable tiers:
 *
 *   - handle_match: the same normalized handle appears on two different
 *     platforms. On its own this is weak (0.5) — many creators share a name —
 *     so it is only ever a review candidate, never an auto-merge.
 *   - corroborated: handle_match + matching display name / country / a bio that
 *     references the other handle. Corroboration lifts confidence toward 0.95
 *     and, when a bio reference is present, promotes the signal to bio_link.
 *
 * The resolver only proposes; the driver worker decides what auto-merges vs.
 * queues for review, and merge.ts enforces the claim-lock.
 */

import { prisma, type Platform } from "@twitchmetrics/database";

export type ResolverProfile = {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  country: string | null;
  bio: string | null;
  totalFollowers: bigint;
  state: string;
  userId: string | null;
  lastStreamAt: Date | null;
};

export type IdentityCandidate = {
  canonicalId: string;
  otherId: string;
  signal: "bio_link" | "handle_match";
  confidence: number;
  evidence: {
    handle: string;
    platforms: [string, string];
    displayNameMatch: boolean;
    countryMatch: boolean;
    bioReference: boolean;
  };
};

export type ResolverOptions = {
  /** Restrict to profiles born from these catalog sources. */
  catalogSources?: string[];
  /** Only consider profiles whose primary platform is one of these. */
  platforms?: string[];
  limit?: number;
};

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "");
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isClaimLocked(p: { state: string; userId: string | null }): boolean {
  return p.state === "claimed" || p.state === "premium" || p.userId !== null;
}

/** Same canonical-choice rule as merge.pickCanonical, on the lighter shape. */
function rank(p: ResolverProfile) {
  return {
    locked: isClaimLocked(p) ? 1 : 0,
    followers: Number(p.totalFollowers),
    last: p.lastStreamAt?.getTime() ?? 0,
  };
}

function chooseCanonical(
  a: ResolverProfile,
  b: ResolverProfile,
): { canonical: ResolverProfile; other: ResolverProfile } {
  const ra = rank(a);
  const rb = rank(b);
  const aWins = { canonical: a, other: b };
  const bWins = { canonical: b, other: a };
  if (ra.locked !== rb.locked) return ra.locked > rb.locked ? aWins : bWins;
  if (ra.followers !== rb.followers)
    return ra.followers > rb.followers ? aWins : bWins;
  if (ra.last !== rb.last) return ra.last > rb.last ? aWins : bWins;
  return a.id < b.id ? aWins : bWins;
}

function bioReferences(bio: string | null, handle: string): boolean {
  if (!bio) return false;
  return bio.toLowerCase().includes(handle.toLowerCase());
}

function scorePair(
  a: ResolverProfile,
  b: ResolverProfile,
  handle: string,
): IdentityCandidate {
  const { canonical, other } = chooseCanonical(a, b);

  const displayNameMatch =
    normalizeName(canonical.displayName) === normalizeName(other.displayName);
  const countryMatch =
    canonical.country != null &&
    other.country != null &&
    canonical.country === other.country;
  const bioReference =
    bioReferences(canonical.bio, other.handle) ||
    bioReferences(other.bio, canonical.handle);

  let confidence = 0.5;
  if (displayNameMatch) confidence += 0.25;
  if (countryMatch) confidence += 0.15;
  if (bioReference) confidence += 0.2;
  confidence = Math.min(confidence, 0.95);

  return {
    canonicalId: canonical.id,
    otherId: other.id,
    signal: bioReference ? "bio_link" : "handle_match",
    confidence,
    evidence: {
      handle,
      platforms: [canonical.platform, other.platform],
      displayNameMatch,
      countryMatch,
      bioReference,
    },
  };
}

async function loadProfiles(
  options: ResolverOptions,
): Promise<ResolverProfile[]> {
  const rows = await prisma.creatorProfile.findMany({
    where: {
      mergedIntoId: null,
      ...(options.catalogSources
        ? { catalogSource: { in: options.catalogSources } }
        : {}),
      ...(options.platforms
        ? { primaryPlatform: { in: options.platforms as Platform[] } }
        : {}),
    },
    select: {
      id: true,
      displayName: true,
      country: true,
      bio: true,
      totalFollowers: true,
      state: true,
      userId: true,
      lastStreamAt: true,
      primaryPlatform: true,
      platformAccounts: {
        select: { platform: true, platformUsername: true },
        take: 1,
      },
    },
    ...(options.limit ? { take: options.limit } : {}),
  });

  return rows.flatMap((r) => {
    const account = r.platformAccounts[0];
    if (!account) return [];
    return [
      {
        id: r.id,
        platform: account.platform,
        handle: normalizeHandle(account.platformUsername),
        displayName: r.displayName,
        country: r.country,
        bio: r.bio,
        totalFollowers: r.totalFollowers,
        state: r.state,
        userId: r.userId,
        lastStreamAt: r.lastStreamAt,
      },
    ];
  });
}

/**
 * Produce identity candidates by grouping profiles on a shared handle and
 * pairing those that sit on different platforms. Deduped so each unordered
 * pair yields at most one candidate (highest confidence wins).
 */
export async function generateIdentityCandidates(
  options: ResolverOptions = {},
): Promise<IdentityCandidate[]> {
  const profiles = await loadProfiles(options);

  const byHandle = new Map<string, ResolverProfile[]>();
  for (const p of profiles) {
    if (!p.handle) continue;
    byHandle.set(p.handle, [...(byHandle.get(p.handle) ?? []), p]);
  }

  const best = new Map<string, IdentityCandidate>();
  for (const [handle, group] of byHandle) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (!a || !b) continue;
        if (a.platform === b.platform) continue; // same platform ≠ cross-link
        const candidate = scorePair(a, b, handle);
        const key = [candidate.canonicalId, candidate.otherId].sort().join(":");
        const existing = best.get(key);
        if (!existing || candidate.confidence > existing.confidence) {
          best.set(key, candidate);
        }
      }
    }
  }

  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}

/** Upsert candidates as `proposed` links without disturbing decided ones. */
export async function persistCandidates(
  candidates: IdentityCandidate[],
): Promise<number> {
  let written = 0;
  for (const c of candidates) {
    const existing = await prisma.identityLink.findUnique({
      where: {
        canonicalProfileId_otherProfileId_signal: {
          canonicalProfileId: c.canonicalId,
          otherProfileId: c.otherId,
          signal: c.signal,
        },
      },
      select: { status: true },
    });
    // Never re-open a merged or human-rejected link.
    if (existing && existing.status !== "proposed") continue;

    await prisma.identityLink.upsert({
      where: {
        canonicalProfileId_otherProfileId_signal: {
          canonicalProfileId: c.canonicalId,
          otherProfileId: c.otherId,
          signal: c.signal,
        },
      },
      create: {
        canonicalProfileId: c.canonicalId,
        otherProfileId: c.otherId,
        signal: c.signal,
        confidence: c.confidence,
        status: "proposed",
        evidence: c.evidence,
      },
      update: { confidence: c.confidence, evidence: c.evidence },
    });
    written++;
  }
  return written;
}
