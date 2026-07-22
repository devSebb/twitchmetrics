/**
 * Profile merge / unmerge — the reversible core of cross-platform identity.
 *
 * When two solo profiles are judged the same creator, one is chosen canonical
 * and the other is folded into it: its PlatformAccounts and StreamHatchet
 * facts/rollups move to the canonical profile, and the absorbed profile becomes
 * a redirect stub (`mergedIntoId` set, `listed = false`). The slug is kept so
 * old links permanently redirect to the canonical profile.
 *
 * Scope of what moves is deliberately narrow — PlatformAccounts + SH catalog
 * data (StreamSessionFact / ChannelDailyRollup / ChannelGameDailyRollup), all
 * keyed by `platformUserId` — so the operation is precise and fully reversible.
 * A profile's own tracked history (MetricSnapshot / growth / clips / analytics)
 * stays put; absorbed profiles are unclaimed SH stubs that have none.
 *
 * Claim-lock: a claimed/owned profile is never folded into another (it can only
 * be the canonical survivor). Auto-merge callers must respect this.
 */

import { Prisma, prisma, type Platform } from "@twitchmetrics/database";
import { listedAfterMerge } from "../creator-visibility";

// Local logger (no `@/` alias) so this service is importable from both the
// Next.js app and the standalone identity worker.
const log = {
  info: (data: Record<string, unknown>, message: string) =>
    console.info(
      `[identity-merge] ${message} ${JSON.stringify(data, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      )}`,
    ),
};
const SOURCE = "streamhatchet";

// A merge/unmerge moves a profile's full StreamHatchet history (StreamSessionFact
// + both rollups) inside one transaction. For a high-volume creator that can take
// well over Prisma's default 5s interactive-transaction timeout, so give it room;
// otherwise the transaction expires mid-way and the whole merge rolls back.
const MERGE_TX_OPTIONS = { timeout: 120_000, maxWait: 15_000 };

export class ClaimLockedError extends Error {
  constructor(profileId: string) {
    super(`Profile ${profileId} is claimed and cannot be absorbed by a merge`);
    this.name = "ClaimLockedError";
  }
}

export class MergeStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeStateError";
  }
}

type ProfileForMerge = {
  id: string;
  state: string;
  userId: string | null;
  totalFollowers: bigint;
  lastStreamAt: Date | null;
  listed: boolean;
  mergedIntoId: string | null;
  platformAccounts: {
    id: string;
    platform: Platform;
    platformUserId: string;
  }[];
};

const PROFILE_SELECT = {
  id: true,
  state: true,
  userId: true,
  totalFollowers: true,
  lastStreamAt: true,
  listed: true,
  mergedIntoId: true,
  platformAccounts: {
    select: { id: true, platform: true, platformUserId: true },
  },
} as const;

export function isClaimLocked(p: {
  state: string;
  userId: string | null;
}): boolean {
  return p.state === "claimed" || p.state === "premium" || p.userId !== null;
}

/** SH partition names that map to a given PlatformAccount platform enum. */
function shPlatformsFor(platform: Platform): string[] {
  if (platform === "youtube") return ["yt", "ytg"];
  if (platform === "twitch") return ["twitch"];
  if (platform === "kick") return ["kick"];
  return [];
}

/**
 * Pick which of two profiles survives as canonical: claimed beats unclaimed,
 * then higher follower count, then more recent activity, then stable id order.
 */
export function pickCanonical(
  a: ProfileForMerge,
  b: ProfileForMerge,
): { canonical: ProfileForMerge; other: ProfileForMerge } {
  const aLocked = isClaimLocked(a);
  const bLocked = isClaimLocked(b);
  if (aLocked !== bLocked) {
    return aLocked ? { canonical: a, other: b } : { canonical: b, other: a };
  }
  if (a.totalFollowers !== b.totalFollowers) {
    return a.totalFollowers > b.totalFollowers
      ? { canonical: a, other: b }
      : { canonical: b, other: a };
  }
  const aLast = a.lastStreamAt?.getTime() ?? 0;
  const bLast = b.lastStreamAt?.getTime() ?? 0;
  if (aLast !== bLast) {
    return aLast > bLast
      ? { canonical: a, other: b }
      : { canonical: b, other: a };
  }
  return a.id < b.id ? { canonical: a, other: b } : { canonical: b, other: a };
}

export type MergeParams = {
  canonicalId: string;
  otherId: string;
  signal: "contact_id" | "admin" | "oauth" | "bio_link" | "handle_match";
  confidence: number;
  decidedBy: string;
  evidence?: Record<string, unknown>;
  /** Allow absorbing a claim-locked profile (admin override only). */
  force?: boolean;
};

export type MergeResult = {
  merged: boolean;
  identityLinkId: string;
  canonicalId: string;
  otherId: string;
  movedAccounts: number;
  movedStreamSessions: number;
  movedChannelRollups: number;
  movedChannelGameRollups: number;
  notMovedAccounts: string[];
};

export async function mergeProfiles(params: MergeParams): Promise<MergeResult> {
  if (params.canonicalId === params.otherId) {
    throw new MergeStateError("Cannot merge a profile into itself");
  }

  const [canonical, other] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { id: params.canonicalId },
      select: PROFILE_SELECT,
    }),
    prisma.creatorProfile.findUnique({
      where: { id: params.otherId },
      select: PROFILE_SELECT,
    }),
  ]);

  if (!canonical || !other) {
    throw new MergeStateError("One or both profiles not found");
  }
  if (canonical.mergedIntoId) {
    throw new MergeStateError(
      `Canonical ${canonical.id} is itself merged into ${canonical.mergedIntoId}`,
    );
  }
  if (other.mergedIntoId) {
    // Already merged (idempotent no-op if into the same canonical).
    if (other.mergedIntoId === canonical.id) {
      const link = await prisma.identityLink.findFirst({
        where: {
          canonicalProfileId: canonical.id,
          otherProfileId: other.id,
          status: "merged",
        },
        select: { id: true },
      });
      return {
        merged: false,
        identityLinkId: link?.id ?? "",
        canonicalId: canonical.id,
        otherId: other.id,
        movedAccounts: 0,
        movedStreamSessions: 0,
        movedChannelRollups: 0,
        movedChannelGameRollups: 0,
        notMovedAccounts: [],
      };
    }
    throw new MergeStateError(
      `Other ${other.id} is already merged into ${other.mergedIntoId}`,
    );
  }
  if (isClaimLocked(other) && !params.force) {
    throw new ClaimLockedError(other.id);
  }

  // Only move accounts on platforms the canonical does not already occupy
  // (the (creatorProfileId, platform) unique would otherwise collide).
  const canonicalPlatforms = new Set(
    canonical.platformAccounts.map((a) => a.platform),
  );
  const movable = other.platformAccounts.filter(
    (a) => !canonicalPlatforms.has(a.platform),
  );
  const notMoved = other.platformAccounts.filter((a) =>
    canonicalPlatforms.has(a.platform),
  );

  let movedStreamSessions = 0;
  let movedChannelRollups = 0;
  let movedChannelGameRollups = 0;

  await prisma.$transaction(async (tx) => {
    for (const account of movable) {
      await tx.platformAccount.update({
        where: { id: account.id },
        data: { creatorProfileId: canonical.id },
      });

      const shPlatforms = shPlatformsFor(account.platform);
      if (shPlatforms.length > 0) {
        const factWhere = {
          source: SOURCE,
          platform: { in: shPlatforms },
          platformUserId: account.platformUserId,
        };
        const [sessions, rollups, gameRollups] = await Promise.all([
          tx.streamSessionFact.updateMany({
            where: factWhere,
            data: { creatorProfileId: canonical.id },
          }),
          tx.channelDailyRollup.updateMany({
            where: factWhere,
            data: { creatorProfileId: canonical.id },
          }),
          tx.channelGameDailyRollup.updateMany({
            where: factWhere,
            data: { creatorProfileId: canonical.id },
          }),
        ]);
        movedStreamSessions += sessions.count;
        movedChannelRollups += rollups.count;
        movedChannelGameRollups += gameRollups.count;
      }
    }

    await tx.creatorProfile.update({
      where: { id: other.id },
      data: { mergedIntoId: canonical.id, listed: false },
    });
    await tx.creatorProfile.update({
      where: { id: canonical.id },
      data: {
        listed: listedAfterMerge(canonical.listed, other.listed),
        updatedAt: new Date(),
      },
    });

    await tx.identityLink.upsert({
      where: {
        canonicalProfileId_otherProfileId_signal: {
          canonicalProfileId: canonical.id,
          otherProfileId: other.id,
          signal: params.signal,
        },
      },
      create: {
        canonicalProfileId: canonical.id,
        otherProfileId: other.id,
        signal: params.signal,
        confidence: params.confidence,
        status: "merged",
        decidedAt: new Date(),
        decidedBy: params.decidedBy,
        ...(params.evidence
          ? { evidence: params.evidence as Prisma.InputJsonValue }
          : {}),
        reversal: {
          movedAccountIds: movable.map((a) => a.id),
          notMovedAccountIds: notMoved.map((a) => a.id),
          otherPriorListed: other.listed,
        },
      },
      update: {
        confidence: params.confidence,
        status: "merged",
        decidedAt: new Date(),
        decidedBy: params.decidedBy,
        ...(params.evidence
          ? { evidence: params.evidence as Prisma.InputJsonValue }
          : {}),
        reversal: {
          movedAccountIds: movable.map((a) => a.id),
          notMovedAccountIds: notMoved.map((a) => a.id),
          otherPriorListed: other.listed,
        },
      },
    });
  }, MERGE_TX_OPTIONS);

  const link = await prisma.identityLink.findUnique({
    where: {
      canonicalProfileId_otherProfileId_signal: {
        canonicalProfileId: canonical.id,
        otherProfileId: other.id,
        signal: params.signal,
      },
    },
    select: { id: true },
  });

  log.info(
    {
      canonicalId: canonical.id,
      otherId: other.id,
      signal: params.signal,
      movedAccounts: movable.length,
      movedStreamSessions,
    },
    "Merged profile",
  );

  return {
    merged: true,
    identityLinkId: link?.id ?? "",
    canonicalId: canonical.id,
    otherId: other.id,
    movedAccounts: movable.length,
    movedStreamSessions,
    movedChannelRollups,
    movedChannelGameRollups,
    notMovedAccounts: notMoved.map((a) => a.id),
  };
}

/** Reverse a merge: move the absorbed accounts + SH facts/rollups back. */
export async function unmergeProfiles(identityLinkId: string): Promise<void> {
  const link = await prisma.identityLink.findUnique({
    where: { id: identityLinkId },
    select: {
      id: true,
      canonicalProfileId: true,
      otherProfileId: true,
      status: true,
      reversal: true,
    },
  });
  if (!link) throw new MergeStateError("IdentityLink not found");
  if (link.status !== "merged") {
    throw new MergeStateError(`IdentityLink ${identityLinkId} is not merged`);
  }

  const reversal = (link.reversal ?? {}) as {
    movedAccountIds?: string[];
    otherPriorListed?: boolean;
  };
  const movedAccountIds = reversal.movedAccountIds ?? [];

  const movedAccounts = await prisma.platformAccount.findMany({
    where: { id: { in: movedAccountIds } },
    select: { id: true, platform: true, platformUserId: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const account of movedAccounts) {
      await tx.platformAccount.update({
        where: { id: account.id },
        data: { creatorProfileId: link.otherProfileId },
      });

      const shPlatforms = shPlatformsFor(account.platform);
      if (shPlatforms.length > 0) {
        const factWhere = {
          source: SOURCE,
          platform: { in: shPlatforms },
          platformUserId: account.platformUserId,
        };
        await Promise.all([
          tx.streamSessionFact.updateMany({
            where: factWhere,
            data: { creatorProfileId: link.otherProfileId },
          }),
          tx.channelDailyRollup.updateMany({
            where: factWhere,
            data: { creatorProfileId: link.otherProfileId },
          }),
          tx.channelGameDailyRollup.updateMany({
            where: factWhere,
            data: { creatorProfileId: link.otherProfileId },
          }),
        ]);
      }
    }

    await tx.creatorProfile.update({
      where: { id: link.otherProfileId },
      data: {
        mergedIntoId: null,
        listed: reversal.otherPriorListed ?? false,
      },
    });
    await tx.identityLink.update({
      where: { id: link.id },
      data: { status: "rejected", decidedAt: new Date() },
    });
  }, MERGE_TX_OPTIONS);

  log.info(
    { identityLinkId, otherId: link.otherProfileId },
    "Unmerged profile",
  );
}
