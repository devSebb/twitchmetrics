import { randomBytes } from "node:crypto";
import {
  prisma,
  type ClaimMethod,
  type ClaimStatus,
  type Platform,
} from "@twitchmetrics/database";
import { scoreUsernameMatch } from "@/server/services/link-extraction";
import { inngest } from "@/inngest/client";
import { transitionProfileState } from "./profile-state";

type InitiateClaimInput = {
  userId: string;
  creatorProfileId: string;
  method: ClaimMethod;
  platform: Platform;
  evidenceUrls?: string[] | undefined;
};

type InitiateClaimResult =
  | { status: "auto_approved"; claimRequestId: string }
  | { status: "pending"; claimRequestId: string; challengeCode?: string }
  | { status: "rejected"; reason: string };

const PROVIDER_BY_PLATFORM: Partial<Record<Platform, string>> = {
  twitch: "twitch",
  youtube: "google",
  x: "twitter",
  instagram: "instagram",
  tiktok: "tiktok",
};

function generateChallengeCode(): string {
  return `tm-verify-${randomBytes(4).toString("hex")}`;
}

export async function approveClaimRequest(
  claimRequestId: string,
  triggeredBy: string,
): Promise<void> {
  const claim = await prisma.claimRequest.findUnique({
    where: { id: claimRequestId },
    select: {
      id: true,
      creatorProfileId: true,
      userId: true,
      status: true,
    },
  });
  if (!claim) {
    throw new Error("Claim request not found");
  }

  if (claim.status !== "approved") {
    const reviewedFields =
      triggeredBy === "system"
        ? { reviewedBy: null, reviewedAt: null as Date | null }
        : { reviewedBy: triggeredBy, reviewedAt: new Date() };

    await prisma.claimRequest.update({
      where: { id: claim.id },
      data: {
        status: "approved",
        resolvedAt: new Date(),
        ...reviewedFields,
      },
    });
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { id: claim.creatorProfileId },
    select: { state: true },
  });

  if (!profile) {
    throw new Error("Creator profile not found");
  }

  if (profile.state === "unclaimed") {
    await transitionProfileState(
      claim.creatorProfileId,
      "pending_claim",
      triggeredBy,
    );
    await transitionProfileState(
      claim.creatorProfileId,
      "claimed",
      triggeredBy,
      {
        ownerUserId: claim.userId,
      },
    );
    await inngest.send({
      name: "claim/approved",
      data: {
        creatorProfileId: claim.creatorProfileId,
        userId: claim.userId,
      },
    });
    return;
  }

  if (profile.state === "pending_claim") {
    await transitionProfileState(
      claim.creatorProfileId,
      "claimed",
      triggeredBy,
      {
        ownerUserId: claim.userId,
      },
    );
    await inngest.send({
      name: "claim/approved",
      data: {
        creatorProfileId: claim.creatorProfileId,
        userId: claim.userId,
      },
    });
    return;
  }
}

export async function rejectClaimRequest(
  claimRequestId: string,
  triggeredBy: string,
  reviewNotes?: string,
  status: ClaimStatus = "rejected",
): Promise<void> {
  const claim = await prisma.claimRequest.findUnique({
    where: { id: claimRequestId },
    select: {
      id: true,
      creatorProfileId: true,
    },
  });

  if (!claim) {
    throw new Error("Claim request not found");
  }

  const reviewedFields =
    triggeredBy === "system"
      ? { reviewedBy: null, reviewedAt: null as Date | null }
      : { reviewedBy: triggeredBy, reviewedAt: new Date() };

  await prisma.claimRequest.update({
    where: { id: claim.id },
    data: {
      status,
      reviewNotes: reviewNotes ?? null,
      ...reviewedFields,
      resolvedAt: new Date(),
    },
  });

  const profile = await prisma.creatorProfile.findUnique({
    where: { id: claim.creatorProfileId },
    select: { state: true },
  });

  if (profile?.state === "pending_claim") {
    await transitionProfileState(
      claim.creatorProfileId,
      "unclaimed",
      triggeredBy,
    );
  }
}

async function createClaimRequest(input: {
  userId: string;
  creatorProfileId: string;
  method: ClaimMethod;
  platform: Platform;
  status: ClaimStatus;
  challengeCode?: string;
  challengeExpiresAt?: Date;
  evidenceUrls?: string[];
  reviewNotes?: string;
}): Promise<string> {
  const created = await prisma.claimRequest.create({
    data: {
      userId: input.userId,
      creatorProfileId: input.creatorProfileId,
      method: input.method,
      platform: input.platform,
      status: input.status,
      challengeCode: input.challengeCode ?? null,
      challengeExpiresAt: input.challengeExpiresAt ?? null,
      evidenceUrls: input.evidenceUrls ?? [],
      reviewNotes: input.reviewNotes ?? null,
      resolvedAt: input.status === "pending" ? null : new Date(),
    },
    select: { id: true },
  });
  return created.id;
}

async function oauthMatchForClaim(input: InitiateClaimInput): Promise<boolean> {
  const provider = PROVIDER_BY_PLATFORM[input.platform];
  if (!provider) return false;

  const account = await prisma.account.findFirst({
    where: {
      userId: input.userId,
      provider,
    },
    select: { providerAccountId: true },
    orderBy: { id: "desc" },
  });
  if (!account?.providerAccountId) {
    return false;
  }

  const matchingPlatformAccount = await prisma.platformAccount.findFirst({
    where: {
      creatorProfileId: input.creatorProfileId,
      platform: input.platform,
      platformUserId: account.providerAccountId,
    },
    select: { id: true },
  });

  return Boolean(matchingPlatformAccount);
}

async function crossPlatformMatchForClaim(
  input: InitiateClaimInput,
): Promise<boolean> {
  const creatorAccounts = await prisma.platformAccount.findMany({
    where: { creatorProfileId: input.creatorProfileId },
    select: {
      platform: true,
      platformUsername: true,
      platformUrl: true,
    },
  });

  const claimantProfile = await prisma.creatorProfile.findUnique({
    where: { userId: input.userId },
    include: {
      platformAccounts: {
        select: {
          platform: true,
          platformUsername: true,
          platformUrl: true,
        },
      },
    },
  });
  const claimantAccounts = claimantProfile?.platformAccounts ?? [];

  let bestConfidence = 0;
  for (const profileAccount of creatorAccounts) {
    for (const claimantAccount of claimantAccounts) {
      const confidenceLevel = scoreUsernameMatch(
        profileAccount.platformUsername,
        claimantAccount.platformUsername,
      );
      const numericConfidence =
        confidenceLevel === "HIGH"
          ? 1
          : confidenceLevel === "MEDIUM"
            ? 0.8
            : confidenceLevel === "LOW"
              ? 0.5
              : 0;
      if (numericConfidence > bestConfidence) {
        bestConfidence = numericConfidence;
      }

      if (
        profileAccount.platformUrl &&
        claimantAccount.platformUrl &&
        profileAccount.platformUrl.includes(claimantAccount.platformUsername)
      ) {
        bestConfidence = Math.max(bestConfidence, 0.8);
      }
    }
  }

  return bestConfidence >= 0.8;
}

async function startBioChallenge(
  input: InitiateClaimInput,
): Promise<InitiateClaimResult> {
  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: { totalFollowers: true },
  });

  if (!creatorProfile) {
    return { status: "rejected", reason: "Profile not found" };
  }

  if (Number(creatorProfile.totalFollowers) > 100_000) {
    return {
      status: "rejected",
      reason: "OAuth required for high-value profiles",
    };
  }

  const challengeCode = generateChallengeCode();
  const claimRequestId = await createClaimRequest({
    userId: input.userId,
    creatorProfileId: input.creatorProfileId,
    method: "bio_challenge",
    platform: input.platform,
    status: "pending",
    challengeCode,
    challengeExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    reviewNotes: "bio_attempts:0",
  });

  await transitionProfileState(
    input.creatorProfileId,
    "pending_claim",
    input.userId,
  );

  return {
    status: "pending",
    claimRequestId,
    challengeCode,
  };
}

export async function initiateClaim(
  input: InitiateClaimInput,
): Promise<InitiateClaimResult> {
  if (input.method === "oauth") {
    const matched = await oauthMatchForClaim(input);
    if (!matched) {
      return {
        status: "rejected",
        reason:
          "No matching connected account found. Connect the profile's platform and try again.",
      };
    }

    const claimRequestId = await createClaimRequest({
      userId: input.userId,
      creatorProfileId: input.creatorProfileId,
      method: "oauth",
      platform: input.platform,
      status: "approved",
    });

    await approveClaimRequest(claimRequestId, "system");
    return { status: "auto_approved", claimRequestId };
  }

  if (input.method === "cross_platform") {
    const matched = await crossPlatformMatchForClaim(input);
    if (matched) {
      const claimRequestId = await createClaimRequest({
        userId: input.userId,
        creatorProfileId: input.creatorProfileId,
        method: "cross_platform",
        platform: input.platform,
        status: "approved",
      });
      await approveClaimRequest(claimRequestId, "system");
      return { status: "auto_approved", claimRequestId };
    }

    return startBioChallenge(input);
  }

  if (input.method === "bio_challenge") {
    return startBioChallenge(input);
  }

  if (input.method === "manual_review") {
    const claimRequestId = await createClaimRequest({
      userId: input.userId,
      creatorProfileId: input.creatorProfileId,
      method: "manual_review",
      platform: input.platform,
      status: "pending",
      evidenceUrls: input.evidenceUrls ?? [],
    });
    await transitionProfileState(
      input.creatorProfileId,
      "pending_claim",
      input.userId,
    );
    return { status: "pending", claimRequestId };
  }

  return {
    status: "rejected",
    reason: "Unsupported claim method",
  };
}
