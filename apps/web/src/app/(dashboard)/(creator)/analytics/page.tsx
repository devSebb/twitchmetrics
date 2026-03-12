import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { Metadata } from "next";
import { prisma, type Platform } from "@twitchmetrics/database";
import { AnalyticsDashboard } from "@/components/analytics";
import { Button } from "@/components/ui";
import { auth } from "@/lib/auth";
import { inngest } from "@/inngest/client";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

type SerializedAnalytics = {
  platform: Platform;
  periodStart: string;
  periodEnd: string;
  estimatedMinutesWatched: string | null;
  averageViewDuration: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
  estimatedRevenue: number | null;
  views: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  impressions: string | null;
  reach: string | null;
  profileViews: number | null;
  websiteClicks: number | null;
  subscriberCount: number | null;
  subscriberPoints: number | null;
  ageGenderData: Record<string, Record<string, number>> | null;
  countryData: Record<string, number> | null;
  deviceData: Record<string, number> | null;
  trafficSources: Record<string, number> | null;
  fetchedAt: string;
};

function serializeAnalytics(data: {
  platform: Platform;
  periodStart: Date;
  periodEnd: Date;
  estimatedMinutesWatched: bigint | null;
  averageViewDuration: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
  estimatedRevenue: number | null;
  views: bigint | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  impressions: bigint | null;
  reach: bigint | null;
  profileViews: number | null;
  websiteClicks: number | null;
  subscriberCount: number | null;
  subscriberPoints: number | null;
  ageGenderData: unknown;
  countryData: unknown;
  deviceData: unknown;
  trafficSources: unknown;
  fetchedAt: Date;
}): SerializedAnalytics {
  return {
    platform: data.platform,
    periodStart: data.periodStart.toISOString(),
    periodEnd: data.periodEnd.toISOString(),
    estimatedMinutesWatched: data.estimatedMinutesWatched?.toString() ?? null,
    averageViewDuration: data.averageViewDuration,
    subscribersGained: data.subscribersGained,
    subscribersLost: data.subscribersLost,
    estimatedRevenue: data.estimatedRevenue,
    views: data.views?.toString() ?? null,
    likes: data.likes,
    comments: data.comments,
    shares: data.shares,
    impressions: data.impressions?.toString() ?? null,
    reach: data.reach?.toString() ?? null,
    profileViews: data.profileViews,
    websiteClicks: data.websiteClicks,
    subscriberCount: data.subscriberCount,
    subscriberPoints: data.subscriberPoints,
    ageGenderData:
      data.ageGenderData &&
      typeof data.ageGenderData === "object" &&
      !Array.isArray(data.ageGenderData)
        ? (data.ageGenderData as Record<string, Record<string, number>>)
        : null,
    countryData:
      data.countryData &&
      typeof data.countryData === "object" &&
      !Array.isArray(data.countryData)
        ? (data.countryData as Record<string, number>)
        : null,
    deviceData:
      data.deviceData &&
      typeof data.deviceData === "object" &&
      !Array.isArray(data.deviceData)
        ? (data.deviceData as Record<string, number>)
        : null,
    trafficSources:
      data.trafficSources &&
      typeof data.trafficSources === "object" &&
      !Array.isArray(data.trafficSources)
        ? (data.trafficSources as Record<string, number>)
        : null,
    fetchedAt: data.fetchedAt.toISOString(),
  };
}

export default async function CreatorAnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      state: true,
    },
  });

  if (
    !creatorProfile ||
    (creatorProfile.state !== "claimed" && creatorProfile.state !== "premium")
  ) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">Analytics</h1>
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#949BA4]">
            Claim your creator profile to unlock private analytics.
          </p>
          <Link href="/dashboard/claim" className="mt-4 inline-block">
            <Button>Claim a profile</Button>
          </Link>
        </div>
      </div>
    );
  }

  const records = await prisma.creatorAnalytics.findMany({
    where: {
      creatorProfileId: creatorProfile.id,
      platform: { in: ["youtube", "instagram", "twitch"] },
    },
    orderBy: [{ platform: "asc" }, { periodStart: "desc" }],
  });

  const latestByPlatform = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    if (!latestByPlatform.has(record.platform)) {
      latestByPlatform.set(record.platform, record);
    }
  }

  const analytics = Array.from(latestByPlatform.values()).map((record) =>
    serializeAnalytics(record),
  );
  const platforms = analytics.map((entry) => entry.platform);
  const creatorProfileId = creatorProfile.id;
  const userId = session.user.id;

  async function refreshEnrichment() {
    "use server";
    await inngest.send({
      name: "claim/approved",
      data: { creatorProfileId, userId },
    });
    revalidatePath("/analytics");
    revalidatePath("/dashboard/analytics");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#F2F3F5]">Analytics</h1>
          <p className="mt-2 text-sm text-[#949BA4]">
            Private post-claim metrics across your connected platforms.
          </p>
        </div>
        <form action={refreshEnrichment}>
          <Button type="submit" variant="secondary">
            Refresh now
          </Button>
        </form>
      </div>

      {platforms.length > 0 ? (
        <AnalyticsDashboard analytics={analytics} platforms={platforms} />
      ) : (
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#949BA4]">
            No enrichment data is available yet. Connect your platforms and
            refresh to fetch analytics.
          </p>
        </div>
      )}
    </div>
  );
}
