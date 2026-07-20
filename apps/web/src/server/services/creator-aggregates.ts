import { prisma } from "@twitchmetrics/database";
import { getTierForCreator } from "@/lib/constants/tiers";

export async function recomputeCreatorAggregates(
  creatorProfileId: string,
): Promise<void> {
  const accounts = await prisma.platformAccount.findMany({
    // Exclude link-only social accounts (discoverySource != null, e.g. the
    // StreamHatchet IG/TikTok/X links): their follower counts are stored for
    // display but must not inflate totalFollowers or the snapshot tier.
    where: { creatorProfileId, discoverySource: null },
    select: {
      followerCount: true,
      totalViews: true,
      lastSyncedAt: true,
    },
  });

  const totalFollowers = accounts.reduce(
    (sum, account) => sum + (account.followerCount ?? 0n),
    0n,
  );
  const totalViews = accounts.reduce(
    (sum, account) => sum + (account.totalViews ?? 0n),
    0n,
  );
  const lastSnapshotAt = accounts.reduce<Date | null>(
    (latest, account) =>
      account.lastSyncedAt &&
      (!latest || account.lastSyncedAt.getTime() > latest.getTime())
        ? account.lastSyncedAt
        : latest,
    null,
  );

  await prisma.creatorProfile.update({
    where: { id: creatorProfileId },
    data: {
      totalFollowers,
      totalViews,
      lastSnapshotAt,
      snapshotTier: getTierForCreator(totalFollowers),
    },
  });
}
