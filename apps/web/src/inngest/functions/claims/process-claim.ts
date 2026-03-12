import { ClaimMethod } from "@twitchmetrics/database";
import { inngest } from "../../client";

type ClaimInitiatedEvent = {
  claimRequestId: string;
  method: ClaimMethod;
};

export const processClaim = inngest.createFunction(
  { id: "process-claim", retries: 2 },
  { event: "claim/initiated" },
  async ({ event, step }) => {
    const { claimRequestId, method } = event.data as ClaimInitiatedEvent;

    if (method === "bio_challenge" || method === "cross_platform") {
      await step.sendEvent("start-bio-polling", {
        name: "claim/verify-challenge",
        data: { claimRequestId },
      });
      return { queued: true };
    }

    if (method === "oauth") {
      await step.run("oauth-auto-claim-was-handled-synchronously", async () => {
        return true;
      });
      return { queued: false };
    }

    if (method === "manual_review") {
      await step.run("manual-review-awaiting-admin", async () => {
        return true;
      });
      return { queued: false };
    }

    return { queued: false };
  },
);
