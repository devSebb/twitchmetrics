import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { auth } from "@/lib/auth";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { DashboardGrid, type SerializedProfile } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      platformAccounts: {
        select: {
          platform: true,
          followerCount: true,
          totalViews: true,
          lastSyncedAt: true,
          isOAuthConnected: true,
        },
      },
      growthRollups: {
        select: {
          platform: true,
          followerCount: true,
          delta1d: true,
          delta7d: true,
          delta30d: true,
          pct1d: true,
          pct7d: true,
          pct30d: true,
          trendDirection: true,
          acceleration: true,
          computedAt: true,
        },
      },
      brandPartnerships: {
        where: { isPublic: true },
        select: {
          id: true,
          brandName: true,
          brandLogoUrl: true,
          campaignName: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!profile) {
    redirect("/dashboard/claim");
  }

  const isClaimed = profile.state === "claimed" || profile.state === "premium";

  // serializeBigInt converts BigInt → string at runtime, but TS still sees the Prisma type.
  // Cast to SerializedProfile since the runtime shape matches after serialization.
  const serialized = serializeBigInt(profile) as unknown as SerializedProfile;

  return (
    <DashboardGrid
      profile={serialized}
      widgetConfig={profile.widgetConfig}
      isClaimed={isClaimed}
      isOwner={true}
    />
  );
}
