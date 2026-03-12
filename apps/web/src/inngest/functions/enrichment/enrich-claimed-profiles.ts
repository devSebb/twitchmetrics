import { createLogger } from "@/lib/logger";
import { inngest } from "../../client";
import {
  enrichSinglePlatformAccount,
  fetchClaimedProfilesForEnrichment,
} from "./shared";

const log = createLogger("enrich-claimed-profiles");

export const enrichClaimedProfiles = inngest.createFunction(
  { id: "enrich-claimed-profiles", retries: 2 },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const profiles = await step.run("fetch-claimed-profiles", async () => {
      return fetchClaimedProfilesForEnrichment();
    });

    let processedPlatforms = 0;
    for (const profile of profiles) {
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
          processedPlatforms += 1;
        });
      }
    }

    log.info(
      {
        profiles: profiles.length,
        processedPlatforms,
      },
      "Completed daily enrichment run",
    );

    return {
      profiles: profiles.length,
      processedPlatforms,
    };
  },
);
