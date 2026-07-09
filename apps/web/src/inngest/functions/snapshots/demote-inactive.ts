import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("demote-inactive");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Daily job: demotes claimed Tier 1 creators with no live activity
 * in the last 30 days back to Tier 2.
 *
 * Only applies to claimed creators who were auto-promoted via the
 * claiming flow. Does NOT demote to tier3 — only tier1 → tier2.
 */
export const demoteInactiveCreators = inngest.createFunction(
  { id: "demote-inactive-creators", name: "Demote Inactive Creators" },
  { cron: "0 4 * * *" }, // Daily at 4am UTC (after snapshot jobs)
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "maintenance",
        jobType: "demote-inactive-creators",
      },
      async () => {
        const tier1Claimed = (await step.run(
          "fetch-tier1-claimed",
          async () => {
            return prisma.creatorProfile.findMany({
              where: {
                snapshotTier: "tier1",
                state: "claimed",
              },
              select: {
                id: true,
                slug: true,
                displayName: true,
              },
            });
          },
        )) as Array<{ id: string; slug: string; displayName: string }>;

        if (tier1Claimed.length === 0) {
          log.info("No claimed tier1 creators to check");
          return {
            result: { demoted: 0, checked: 0 },
            summary: {},
          };
        }

        const cutoffDate = new Date(Date.now() - THIRTY_DAYS_MS);

        let demoted = 0;

        await step.run("check-and-demote", async () => {
          for (const creator of tier1Claimed) {
            const liveSnapshot = await prisma.metricSnapshot.findFirst({
              where: {
                creatorProfileId: creator.id,
                snapshotAt: { gte: cutoffDate },
                extendedMetrics: {
                  path: ["IS_LIVE"],
                  equals: 1,
                },
              },
              select: { id: true },
            });

            if (!liveSnapshot) {
              await prisma.creatorProfile.update({
                where: { id: creator.id },
                data: { snapshotTier: "tier2" },
              });
              demoted++;
              log.info(
                { slug: creator.slug, displayName: creator.displayName },
                "Demoted from tier1 to tier2 — no live activity in 30 days",
              );
            }
          }
        });

        log.info(
          { checked: tier1Claimed.length, demoted },
          "Inactive creator demotion complete",
        );

        return {
          result: { demoted, checked: tier1Claimed.length },
          summary: {
            recordsScanned: tier1Claimed.length,
            recordsWritten: demoted,
            recordsSkipped: Math.max(tier1Claimed.length - demoted, 0),
          },
        };
      },
      step,
    );
  },
);
