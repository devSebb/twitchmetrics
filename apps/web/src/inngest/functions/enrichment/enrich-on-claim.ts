import { createLogger } from "@/lib/logger";
import { inngest } from "../../client";
import {
  enrichSinglePlatformAccount,
  fetchClaimedProfilesForEnrichment,
} from "./shared";

const log = createLogger("enrich-on-claim");

type ClaimApprovedEvent = {
  creatorProfileId: string;
  userId: string;
};

export const enrichOnClaim = inngest.createFunction(
  { id: "enrich-on-claim", retries: 3 },
  { event: "claim/approved" },
  async ({ event, step }) => {
    const { creatorProfileId } = event.data as ClaimApprovedEvent;
    if (!creatorProfileId) {
      return { enrichedPlatforms: 0, skipped: true };
    }

    const profiles = await step.run(
      "fetch-single-claimed-profile",
      async () => {
        return fetchClaimedProfilesForEnrichment(creatorProfileId);
      },
    );
    const profile = profiles[0];
    if (!profile) {
      return { enrichedPlatforms: 0, skipped: true };
    }

    let enrichedPlatforms = 0;
    for (const account of profile.platformAccounts) {
      const encryptedAccessToken = account.accessToken;
      if (!account.isOAuthConnected || !encryptedAccessToken) {
        continue;
      }

      await step.run(`enrich-${profile.id}-${account.platform}`, async () => {
        await enrichSinglePlatformAccount({
          creatorProfileId: profile.id,
          platformAccountId: account.id,
          platform: account.platform,
          platformUserId: account.platformUserId,
          encryptedAccessToken,
        });
        enrichedPlatforms += 1;
      });
    }

    log.info(
      {
        creatorProfileId,
        enrichedPlatforms,
      },
      "Completed post-claim enrichment run",
    );

    return { enrichedPlatforms, skipped: false };
  },
);
