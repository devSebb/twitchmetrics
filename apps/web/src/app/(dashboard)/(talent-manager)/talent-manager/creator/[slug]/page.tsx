import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { getSession } from "@/server/auth-cache";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { CreatorDetailView } from "@/components/manager/CreatorDetailView";
import type { Platform } from "@twitchmetrics/database";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Manage ${slug}`,
    robots: { index: false, follow: false },
  };
}

export default async function TalentManagerCreatorPage({ params }: PageProps) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "talent_manager") redirect("/dashboard");

  const { slug } = await params;

  const profile = await prisma.creatorProfile.findUnique({
    where: { slug },
    include: {
      platformAccounts: {
        select: {
          platform: true,
          platformUsername: true,
          followerCount: true,
        },
      },
      growthRollups: {
        orderBy: { computedAt: "desc" },
        select: {
          platform: true,
          delta7d: true,
          pct7d: true,
          trendDirection: true,
        },
      },
    },
  });

  if (!profile) notFound();

  // Verify the talent manager has access to this creator
  const access = await prisma.talentManagerAccess.findFirst({
    where: {
      managerId: session.user.id,
      creatorProfileId: profile.id,
      revokedAt: null,
    },
  });

  if (!access) notFound();

  const serialized = serializeBigInt(profile);

  const creatorData = {
    id: serialized.id as string,
    displayName: serialized.displayName as string,
    slug: serialized.slug as string,
    avatarUrl: serialized.avatarUrl as string | null,
    primaryPlatform: serialized.primaryPlatform as Platform | null,
    totalFollowers: String(serialized.totalFollowers),
    totalViews: String(serialized.totalViews),
    state: serialized.state as string,
    lastSnapshotAt: serialized.lastSnapshotAt
      ? String(serialized.lastSnapshotAt)
      : null,
    platformAccounts: (
      serialized.platformAccounts as {
        platform: Platform;
        platformUsername: string;
        followerCount: bigint | number | null;
      }[]
    ).map((a) => ({
      platform: a.platform,
      platformUsername: a.platformUsername,
      followerCount: a.followerCount ? String(a.followerCount) : "0",
    })),
    growthRollups: (
      serialized.growthRollups as {
        platform: Platform;
        delta7d: bigint | number | null;
        pct7d: number | null;
        trendDirection: string | null;
      }[]
    ).map((g) => ({
      platform: g.platform,
      delta7d: String(g.delta7d),
      pct7d: g.pct7d,
      trendDirection: g.trendDirection,
    })),
  };

  const permissionsData = {
    canViewAnalytics: access.canViewAnalytics,
    canEditProfile: access.canEditProfile,
    canExportData: access.canExportData,
    canManageBrands: access.canManageBrands,
  };

  return (
    <CreatorDetailView
      creator={creatorData}
      permissions={permissionsData}
      grantedAt={access.grantedAt.toISOString()}
    />
  );
}
