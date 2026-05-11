import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { CreatorQuickStats } from "@/components/dashboard";
import { Card } from "@/components/ui";
import { getSession } from "@/server/auth-cache";

export const metadata: Metadata = {
  title: "Dashboard Home",
  robots: { index: false, follow: false },
};

function formatBigint(value: bigint): string {
  return Number(value).toLocaleString();
}

export default async function DashboardHomePage() {
  const session = await getSession();
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
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold text-[#F2F3F5]">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-[#949BA4]">
            Platform overview and claim management.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
              Pending claims
            </p>
            <p className="mt-1 text-3xl font-bold text-[#F2F3F5]">
              {pendingClaims}
            </p>
            <Link
              href="/dashboard/admin/claims"
              className="mt-3 inline-flex items-center gap-1 text-sm text-[#93c5fd] hover:underline"
            >
              Review queue →
            </Link>
          </Card>
          <Card>
            <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
              Platform health
            </p>
            <div className="mt-3 space-y-2">
              {platformHealth.map((item) => (
                <div
                  key={item.platform}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm capitalize text-[#DBDEE1]">
                    {item.platform}
                  </span>
                  <span className="rounded-full bg-[#383A40] px-2.5 py-0.5 text-xs font-medium text-[#F2F3F5]">
                    {item._count._all}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card>
          <h2 className="text-lg font-semibold text-[#F2F3F5]">
            Recent claims
          </h2>
          <div className="mt-3 divide-y divide-[#3F4147]">
            {recentClaims.length > 0 ? (
              recentClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-sm text-[#DBDEE1]">
                    {claim.creatorProfile.displayName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#383A40] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#949BA4]">
                      {claim.method}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                        claim.status === "pending"
                          ? "bg-[#f59e0b]/10 text-[#fcd34d]"
                          : claim.status === "approved"
                            ? "bg-[#22c55e]/10 text-[#86efac]"
                            : "bg-[#ef4444]/10 text-[#fca5a5]"
                      }`}
                    >
                      {claim.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-3 text-sm text-[#949BA4]">
                No claim activity yet.
              </p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (session.user.role === "talent_manager") {
    redirect("/dashboard/roster");
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

  const creatorProfile = user?.creatorProfile;
  const isClaimed =
    creatorProfile?.state === "claimed" || creatorProfile?.state === "premium";

  if (
    !creatorProfile ||
    !isClaimed ||
    creatorProfile.platformAccounts.length === 0
  ) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold text-[#F2F3F5]">
            Welcome, {user?.name ?? "Creator"}
          </h1>
          <p className="mt-1 text-sm text-[#949BA4]">
            Connect your streaming platforms to start tracking your growth.
          </p>
        </div>
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#F2F3F5]">
                Get started
              </h2>
              <p className="mt-1 text-sm text-[#949BA4]">
                Link your Twitch, YouTube, or other accounts to begin importing
                your channel data and analytics.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/dashboard/connections"
                className="inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#C72615]"
              >
                Connect platforms
              </Link>
              <Link
                href="/dashboard/claim"
                className="inline-flex items-center gap-2 rounded-lg border border-[#3F4147] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
              >
                Claim existing profile
              </Link>
            </div>
          </div>
        </Card>
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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Welcome back, {user?.name ?? "Creator"}
        </h1>
        <p className="mt-1 text-sm text-[#949BA4]">
          Snapshot of your creator performance and quick actions.
        </p>
      </div>

      <CreatorQuickStats
        totalFollowers={formatBigint(creatorProfile.totalFollowers)}
        growth7d={growth7d.toLocaleString()}
        connectedPlatforms={creatorProfile.platformAccounts.length}
        lastEnrichmentAt={latestAnalytics?.fetchedAt.toISOString() ?? null}
      />

      <Card>
        <h2 className="text-base font-semibold text-[#F2F3F5]">
          Quick actions
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link
            href={`/creator/${creatorProfile.slug}`}
            className="flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-3 text-sm text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            View Public Profile
          </Link>
          <Link
            href="/dashboard/connections"
            className="flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-3 text-sm text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Manage Connections
          </Link>
          <Link
            href="/dashboard/analytics"
            className="flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-3 text-sm text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            View Analytics
          </Link>
        </div>
      </Card>
    </div>
  );
}
