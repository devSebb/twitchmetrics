import { prisma } from "@twitchmetrics/database";
import { verifyBioChallenge } from "@/server/services/bio-verification";
import { rejectClaimRequest } from "@/server/services/claiming";
import { inngest } from "../../client";

type VerifyChallengeEvent = {
  claimRequestId: string;
};

export const verifyChallenge = inngest.createFunction(
  {
    id: "verify-challenge",
    retries: 0,
  },
  { event: "claim/verify-challenge" },
  async ({ event, step }) => {
    const { claimRequestId } = event.data as VerifyChallengeEvent;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) {
        await step.sleep(`wait-${attempt}`, "4h");
      }

      const result = await step.run(`check-bio-${attempt}`, async () => {
        return verifyBioChallenge(claimRequestId);
      });

      if (result.verified) {
        return { status: "approved", attempts: attempt + 1 };
      }

      if (result.attemptsRemaining <= 0) {
        return { status: "expired", attempts: attempt + 1 };
      }
    }

    await step.run("expire-challenge", async () => {
      const claim = await prisma.claimRequest.findUnique({
        where: { id: claimRequestId },
        select: { id: true, status: true },
      });
      if (claim && claim.status === "pending") {
        await rejectClaimRequest(
          claimRequestId,
          "system",
          "Bio challenge expired",
          "expired",
        );
      }
    });

    return { status: "expired" };
  },
);
