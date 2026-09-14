import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { discoverLinksForCreator } from "@/server/services/social-link-discovery";
import { createLogger } from "@/lib/logger";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("discover-social-links");

const BATCH_SIZE = 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Social link discovery — scans creator bios for cross-platform links
 * and creates PlatformAccount records for any discovered accounts.
 *
 * Manual one-off only: the daily cron was retired (the SH social-profiles feed
 * supersedes it). Run it from the Inngest dashboard by sending the
 * `creators/discover-links` event. It must stay registered for that to work.
 *
 * Processes up to 1,000 creators per run, prioritising those never scanned.
 * Most creators only require local bio parsing; API verification is limited to
 * discovered links that are strong enough to persist.
 */
export const discoverSocialLinks = inngest.createFunction(
  { id: "discover-social-links", concurrency: { limit: 1 } },
  { event: "creators/discover-links" },
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "discovery",
        jobType: "discover-social-links",
      },
      async () => {
        // --------------------------------------------------------
        // Step 1: Fetch eligible creators
        // --------------------------------------------------------
        const creators = await step.run("fetch-eligible", async () => {
          const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

          return prisma.creatorProfile.findMany({
            where: {
              AND: [
                {
                  platformAccounts: { some: {} },
                },
                {
                  OR: [
                    { lastLinkDiscoveryAt: null },
                    { lastLinkDiscoveryAt: { lt: thirtyDaysAgo } },
                  ],
                },
              ],
            },
            select: {
              id: true,
              bio: true,
              primaryPlatform: true,
              platformAccounts: {
                select: {
                  platform: true,
                  platformUserId: true,
                  platformUsername: true,
                },
              },
            },
            orderBy: { lastLinkDiscoveryAt: "asc" },
            take: BATCH_SIZE,
          });
        });

        log.info(
          { count: creators.length },
          "Starting social link discovery batch",
        );

        // --------------------------------------------------------
        // Step 2: Process each creator
        // --------------------------------------------------------
        const summary = await step.run("process-batch", async () => {
          let totalLinked = 0;
          let totalSkipped = 0;
          let errors = 0;

          for (const creator of creators) {
            try {
              const result = await discoverLinksForCreator(creator);
              totalLinked += result.linked;
              totalSkipped += result.skipped;

              if (result.linked > 0) {
                log.info(
                  { creatorId: creator.id, linked: result.linked },
                  "Linked new platform accounts",
                );
              }
            } catch (err) {
              errors++;
              log.error(
                { creatorId: creator.id, err },
                "Failed to run discovery for creator",
              );
            }
          }

          return {
            processed: creators.length,
            totalLinked,
            totalSkipped,
            errors,
          };
        });

        log.info(summary, "Social link discovery complete");
        return {
          result: summary,
          summary: {
            recordsScanned: summary.processed,
            recordsWritten: summary.totalLinked,
            recordsSkipped: summary.totalSkipped,
            recordsFailed: summary.errors,
          },
        };
      },
      step,
    );
  },
);
