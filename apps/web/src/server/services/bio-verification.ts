import { prisma } from "@twitchmetrics/database";
import { approveClaimRequest, rejectClaimRequest } from "./claiming";

type VerifyBioResult = {
  verified: boolean;
  attemptsRemaining: number;
};

function parseAttempts(reviewNotes: string | null): number {
  if (!reviewNotes) return 0;
  const match = reviewNotes.match(/bio_attempts:(\d+)/);
  if (!match?.[1]) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setAttempts(reviewNotes: string | null, attempts: number): string {
  const notes = reviewNotes ?? "";
  if (notes.includes("bio_attempts:")) {
    return notes.replace(/bio_attempts:\d+/, `bio_attempts:${attempts}`);
  }
  return `${notes}${notes ? "\n" : ""}bio_attempts:${attempts}`;
}

async function fetchPlatformBio(
  platform: string,
  platformUserId: string,
): Promise<string | null> {
  if (platform === "youtube") {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", platformUserId);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = (await response.json()) as {
      items?: Array<{ snippet?: { description?: string } }>;
    };
    return json.items?.[0]?.snippet?.description ?? null;
  }

  // For platforms that need additional API credentials, fallback to stored profile bio.
  return null;
}

export async function verifyBioChallenge(
  claimRequestId: string,
): Promise<VerifyBioResult> {
  const claimRequest = await prisma.claimRequest.findUnique({
    where: { id: claimRequestId },
    include: {
      creatorProfile: {
        include: {
          platformAccounts: true,
        },
      },
    },
  });

  if (!claimRequest || claimRequest.method !== "bio_challenge") {
    throw new Error("Bio challenge claim request not found");
  }

  if (!claimRequest.challengeCode) {
    throw new Error("Missing challenge code");
  }

  if (
    claimRequest.challengeExpiresAt &&
    claimRequest.challengeExpiresAt.getTime() < Date.now()
  ) {
    await rejectClaimRequest(
      claimRequest.id,
      "system",
      "Challenge expired",
      "expired",
    );
    return { verified: false, attemptsRemaining: 0 };
  }

  const attempts = parseAttempts(claimRequest.reviewNotes);
  if (attempts >= 3) {
    await rejectClaimRequest(
      claimRequest.id,
      "system",
      "Maximum bio verification attempts reached",
      "expired",
    );
    return { verified: false, attemptsRemaining: 0 };
  }

  const primaryAccount = claimRequest.creatorProfile.platformAccounts.find(
    (account) => account.platform === claimRequest.platform,
  );

  const remoteBio = primaryAccount
    ? await fetchPlatformBio(
        primaryAccount.platform,
        primaryAccount.platformUserId,
      )
    : null;
  const storedBio = claimRequest.creatorProfile.bio ?? "";
  const candidateBio = `${storedBio}\n${remoteBio ?? ""}`;

  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.CLAIM_BIO_VERIFY_DEV_BYPASS !== "false";
  const isVerified =
    devBypass || candidateBio.includes(claimRequest.challengeCode);

  if (isVerified) {
    await approveClaimRequest(claimRequest.id, "system");
    return { verified: true, attemptsRemaining: Math.max(0, 2 - attempts) };
  }

  const nextAttempts = attempts + 1;
  const attemptsRemaining = Math.max(0, 3 - nextAttempts);

  await prisma.claimRequest.update({
    where: { id: claimRequest.id },
    data: {
      reviewNotes: setAttempts(claimRequest.reviewNotes, nextAttempts),
    },
  });

  if (attemptsRemaining <= 0) {
    await rejectClaimRequest(
      claimRequest.id,
      "system",
      "Bio challenge failed after maximum attempts",
      "expired",
    );
  }

  return {
    verified: false,
    attemptsRemaining,
  };
}
