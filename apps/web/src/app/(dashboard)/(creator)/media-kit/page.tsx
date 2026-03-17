import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type Platform } from "@twitchmetrics/database";
import { auth } from "@/lib/auth";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { MediaKitLayout } from "@/components/media-kit/MediaKitLayout";
import { Button } from "@/components/ui";

export const metadata: Metadata = {
  title: "Media Kit",
  robots: { index: false, follow: false },
};

export default async function MediaKitPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      platformAccounts: {
        select: {
          platform: true,
          platformUsername: true,
          platformUrl: true,
          followerCount: true,
          totalViews: true,
        },
      },
      growthRollups: {
        select: {
          platform: true,
          followerCount: true,
          delta30d: true,
          pct30d: true,
          trendDirection: true,
        },
      },
      brandPartnerships: {
        where: { isPublic: true },
        select: {
          brandName: true,
          brandLogoUrl: true,
          campaignName: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">Media Kit</h1>
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#949BA4]">
            Claim a creator profile to generate your media kit.
          </p>
          <Link href="/dashboard/claim" className="mt-4 inline-block">
            <Button>Claim a Profile</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isClaimed = profile.state === "claimed" || profile.state === "premium";

  if (!isClaimed) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">Media Kit</h1>
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#949BA4]">
            Your profile claim is still pending. Once approved your media kit
            will be generated automatically.
          </p>
        </div>
      </div>
    );
  }

  const serialized = serializeBigInt(profile);

  const analytics = await prisma.creatorAnalytics.findFirst({
    where: { creatorProfileId: profile.id },
    orderBy: { periodEnd: "desc" },
    select: { ageGenderData: true, countryData: true },
  });

  type PlatformValue = string;

  const profileData = {
    displayName: serialized.displayName as string,
    slug: serialized.slug as string,
    avatarUrl: serialized.avatarUrl as string | null,
    bannerUrl: serialized.bannerUrl as string | null,
    bio: serialized.bio as string | null,
    country: serialized.country as string | null,
    state: serialized.state as string,
    totalFollowers: String(serialized.totalFollowers),
    totalViews: String(serialized.totalViews),
    platformAccounts: (
      serialized.platformAccounts as {
        platform: PlatformValue;
        platformUsername: string;
        platformUrl: string | null;
        followerCount: bigint | number | null;
        totalViews: bigint | number | null;
      }[]
    ).map((a) => ({
      platform: a.platform as Platform,
      platformUsername: a.platformUsername,
      platformUrl: a.platformUrl,
      followerCount: a.followerCount ? String(a.followerCount) : "0",
      totalViews: a.totalViews ? String(a.totalViews) : "0",
    })),
    growthRollups: (
      serialized.growthRollups as {
        platform: PlatformValue;
        followerCount: bigint | number | null;
        delta30d: bigint | number | null;
        pct30d: number | null;
        trendDirection: string | null;
      }[]
    ).map((g) => ({
      platform: g.platform as Platform,
      followerCount: String(g.followerCount),
      delta30d: String(g.delta30d),
      pct30d: g.pct30d,
      trendDirection: g.trendDirection,
    })),
    partnerships: (
      serialized.brandPartnerships as {
        brandName: string;
        brandLogoUrl: string | null;
        campaignName: string | null;
      }[]
    ).map((p) => ({
      brandName: p.brandName,
      brandLogoUrl: p.brandLogoUrl,
      campaignName: p.campaignName,
    })),
  };

  const analyticsData = analytics ? serializeBigInt(analytics) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#F2F3F5]">Media Kit</h1>
          <p className="mt-2 text-sm text-[#949BA4]">
            Preview your public media kit. Share it with brands and agencies.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/creator/${profile.slug}/media-kit`} target="_blank">
            <Button variant="secondary" size="sm">
              Open Public Link
            </Button>
          </Link>
          <Button
            size="sm"
            variant="secondary"
            disabled
            title="Coming soon"
            className="cursor-not-allowed opacity-50"
          >
            Download PDF
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[#3F4147] bg-[#2B2D31]">
        <MediaKitLayout profile={profileData} analytics={analyticsData} />
      </div>
    </div>
  );
}
