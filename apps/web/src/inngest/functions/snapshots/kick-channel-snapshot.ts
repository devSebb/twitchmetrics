import { Prisma, prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import {
  fetchKickChannelsBySlugs,
  fetchKickChannelsByUserIds,
  kickChannelToSnapshot,
  type KickChannel,
} from "@/server/adapters/kick";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("kick-channel-snapshot");
const BATCH_SIZE = 50;

type KickAccount = {
  id: string;
  creatorProfileId: string;
  platformUserId: string;
  platformUsername: string;
  creatorProfile: { slug: string };
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function compactJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as Prisma.InputJsonValue;
}

function persistableMetrics(
  metrics: Record<string, unknown>,
): Prisma.InputJsonValue {
  return compactJson(
    Object.fromEntries(
      Object.entries(metrics).filter(([key]) => !key.startsWith("_")),
    ),
  );
}

function matchChannelToAccount(
  channel: KickChannel,
  accounts: KickAccount[],
): KickAccount | null {
  const userId =
    channel.broadcaster_user_id !== undefined
      ? String(channel.broadcaster_user_id)
      : null;
  if (userId) {
    const match = accounts.find((account) => account.platformUserId === userId);
    if (match) return match;
  }

  const slug = channel.slug?.toLowerCase();
  if (!slug) return null;
  return (
    accounts.find(
      (account) => account.platformUsername.toLowerCase() === slug,
    ) ?? null
  );
}

async function snapshotKickBatch(accounts: KickAccount[]) {
  const numericAccounts = accounts.filter((account) =>
    isNumericId(account.platformUserId),
  );
  const slugAccounts = accounts.filter(
    (account) => !isNumericId(account.platformUserId),
  );

  const channels = [
    ...(await fetchKickChannelsByUserIds(
      numericAccounts.map((account) => account.platformUserId),
    )),
    ...(await fetchKickChannelsBySlugs(
      slugAccounts.map((account) => account.platformUsername),
    )),
  ];

  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const channel of channels) {
    const account = matchChannelToAccount(channel, accounts);
    if (!account) {
      skipped++;
      continue;
    }

    try {
      const snapshot = kickChannelToSnapshot(channel, account.platformUserId);
      const ext = snapshot.extendedMetrics as Record<string, unknown>;
      const login = typeof ext._login === "string" ? ext._login : null;
      const displayName =
        typeof ext._displayName === "string" ? ext._displayName : null;
      const avatarUrl =
        typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;

      await prisma.$transaction([
        prisma.metricSnapshot.create({
          data: {
            creatorProfileId: account.creatorProfileId,
            platform: "kick",
            snapshotAt: snapshot.snapshotAt,
            followerCount: null,
            followingCount: null,
            totalViews: null,
            subscriberCount: null,
            postCount: null,
            extendedMetrics: persistableMetrics(ext),
          },
        }),
        prisma.platformAccount.update({
          where: { id: account.id },
          data: {
            ...(login ? { platformUsername: login } : {}),
            ...(displayName ? { platformDisplayName: displayName } : {}),
            ...(login ? { platformUrl: `https://kick.com/${login}` } : {}),
            ...(avatarUrl ? { platformAvatarUrl: avatarUrl } : {}),
            lastSyncedAt: snapshot.snapshotAt,
          },
        }),
      ]);

      try {
        await cacheInvalidate(`creator:${account.creatorProfile.slug}`);
        await cacheInvalidate(`creator:${account.creatorProfile.slug}:*`);
      } catch {
        // Non-blocking.
      }

      written++;
    } catch (error) {
      failed++;
      log.warn(
        {
          err: error,
          platformUserId: account.platformUserId,
          platformUsername: account.platformUsername,
        },
        "KICK channel snapshot failed",
      );
    }
  }

  skipped += Math.max(accounts.length - channels.length, 0);
  return { written, skipped, failed };
}

export const kickChannelSnapshot = inngest.createFunction(
  { id: "kick-channel-snapshot", concurrency: { limit: 1 } },
  [{ cron: "15 */6 * * *" }, { event: "snapshots/kick" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "snapshot",
        jobType: "kick-channel-snapshot",
        platform: "kick",
      },
      async () => {
        if (!process.env.KICK_CLIENT_ID || !process.env.KICK_CLIENT_SECRET) {
          const result = {
            scanned: 0,
            written: 0,
            skipped: 0,
            failed: 0,
            reason: "KICK API credentials are not configured",
          };
          log.warn(result, "Skipping KICK channel snapshot");

          return {
            result,
            summary: {
              recordsScanned: 0,
              recordsWritten: 0,
              recordsSkipped: 0,
              recordsFailed: 0,
            },
          };
        }

        const accounts = (await step.run("load-kick-accounts", async () => {
          return prisma.platformAccount.findMany({
            where: {
              platform: "kick",
              platformUserId: { not: "" },
            },
            select: {
              id: true,
              creatorProfileId: true,
              platformUserId: true,
              platformUsername: true,
              creatorProfile: {
                select: { slug: true },
              },
            },
          });
        })) as KickAccount[];

        let written = 0;
        let skipped = 0;
        let failed = 0;

        for (const [batchIndex, batch] of chunk(
          accounts,
          BATCH_SIZE,
        ).entries()) {
          const result = (await step.run(
            `snapshot-kick-batch-${batchIndex}`,
            async () => snapshotKickBatch(batch),
          )) as Awaited<ReturnType<typeof snapshotKickBatch>>;

          written += result.written;
          skipped += result.skipped;
          failed += result.failed;
        }

        try {
          await cacheInvalidate("trending:landing");
        } catch {
          // Non-blocking.
        }

        const result = {
          scanned: accounts.length,
          written,
          skipped,
          failed,
        };
        log.info(result, "KICK channel snapshot completed");

        return {
          result,
          summary: {
            recordsScanned: accounts.length,
            recordsWritten: written,
            recordsSkipped: skipped,
            recordsFailed: failed,
          },
        };
      },
    );
  },
);
