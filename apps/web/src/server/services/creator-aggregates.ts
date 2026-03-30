import { prisma } from "@twitchmetrics/database";
import { getTierForCreator } from "@/lib/constants/tiers";

export async function recomputeCreatorAggregates(
  creatorProfileId: string,
): Promise<void> {
  const accounts = await prisma.platformAccount.findMany({
    where: { creatorProfileId },
    select: {
      followerCount: true,
      totalViews: true,
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

  await prisma.creatorProfile.update({
    where: { id: creatorProfileId },
    data: {
      totalFollowers,
      totalViews,
      lastSnapshotAt: new Date(),
      snapshotTier: getTierForCreator(totalFollowers),
    },
  });
}
