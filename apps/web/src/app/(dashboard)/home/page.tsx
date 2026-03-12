import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { ClaimCTA, CreatorQuickStats } from "@/components/dashboard";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard Home",
  robots: { index: false, follow: false },
};

function formatBigint(value: bigint): string {
  return Number(value).toLocaleString();
}

export default async function DashboardHomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role === "admin") {
    const [pendingClaims, recentClaims, platformHealth] = await Promise.all([
      prisma.claimRequest.count({ where: { status: "pending" } }),
      prisma.claimRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          method: true,
          createdAt: true,
          creatorProfile: { select: { displayName: true } },
        },
      }),
      prisma.platformAccount.groupBy({
        by: ["platform"],
        _count: { _all: true },
        where: { isOAuthConnected: true },
      }),
    ]);

    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">Admin Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="text-xs uppercase text-[#949BA4]">Pending claims</p>
            <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
              {pendingClaims}
            </p>
            <Link
              href="/dashboard/admin/claims"
              className="mt-3 inline-block text-sm text-[#93c5fd] hover:underline"
            >
              Review queue
            </Link>
          </Card>
          <Card className="space-y-2">
            <p className="text-xs uppercase text-[#949BA4]">Platform health</p>
            {platformHealth.map((item) => (
              <p key={item.platform} className="text-sm text-[#DBDEE1]">
                {item.platform}: {item._count._all}
              </p>
            ))}
          </Card>
        </div>
        <Card className="space-y-2">
          <h2 className="text-lg font-semibold text-[#F2F3F5]">
            Recent claims
          </h2>
          {recentClaims.length > 0 ? (
            recentClaims.map((claim) => (
              <p key={claim.id} className="text-sm text-[#DBDEE1]">
                {claim.creatorProfile.displayName} - {claim.status} (
                {claim.method})
              </p>
            ))
          ) : (
            <p className="text-sm text-[#949BA4]">No claim activity yet.</p>
          )}
        </Card>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      role: true,
      creatorProfile: {
        select: {
          id: true,
          slug: true,
          state: true,
          totalFollowers: true,
          platformAccounts: {
            where: { isOAuthConnected: true },
            select: { id: true },
          },
          growthRollups: {
            select: { delta7d: true },
          },
        },
      },
    },
  });

  if (session.user.role === "talent_manager") {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Welcome back, {user?.name ?? "Manager"}
        </h1>
        <Card>
          <p className="text-sm text-[#949BA4]">
            Manage your creator roster and collaboration workflows.
          </p>
          <Link
            href="/dashboard/roster"
            className="mt-3 inline-block text-sm text-[#93c5fd] hover:underline"
          >
            Open roster
          </Link>
        </Card>
      </div>
    );
  }

  const creatorProfile = user?.creatorProfile;
  const isClaimed =
    creatorProfile?.state === "claimed" || creatorProfile?.state === "premium";

  if (!creatorProfile || !isClaimed) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Welcome back, {user?.name ?? "Creator"}
        </h1>
        <ClaimCTA />
      </div>
    );
  }

  const growth7d = creatorProfile.growthRollups.reduce(
    (sum, rollup) => sum + Number(rollup.delta7d),
    0,
  );

  const latestAnalytics = await prisma.creatorAnalytics.findFirst({
    where: { creatorProfileId: creatorProfile.id },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Welcome back, {user?.name ?? "Creator"}
        </h1>
        <p className="mt-2 text-sm text-[#949BA4]">
          Snapshot of your creator performance and quick actions.
        </p>
      </div>

      <CreatorQuickStats
        totalFollowers={formatBigint(creatorProfile.totalFollowers)}
        growth7d={growth7d.toLocaleString()}
        connectedPlatforms={creatorProfile.platformAccounts.length}
        lastEnrichmentAt={latestAnalytics?.fetchedAt.toISOString() ?? null}
      />

      <Card className="space-y-2">
        <h2 className="text-lg font-semibold text-[#F2F3F5]">Quick actions</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            href={`/creator/${creatorProfile.slug}`}
            className="text-[#93c5fd]"
          >
            View Public Profile
          </Link>
          <Link href="/dashboard/connections" className="text-[#93c5fd]">
            Manage Connections
          </Link>
          <Link href="/dashboard/analytics" className="text-[#93c5fd]">
            View Analytics
          </Link>
        </div>
      </Card>
    </div>
  );
}
