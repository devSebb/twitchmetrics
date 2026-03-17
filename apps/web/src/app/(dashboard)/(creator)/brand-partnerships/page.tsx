import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { auth } from "@/lib/auth";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { BrandPartnersWidget } from "@/components/widgets";
import { Button } from "@/components/ui";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

export const metadata: Metadata = {
  title: "Brand Partnerships",
  robots: { index: false, follow: false },
};

export default async function BrandPartnershipsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
        orderBy: { computedAt: "desc" },
      },
      brandPartnerships: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Brand Partnerships
        </h1>
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#949BA4]">
            Claim a creator profile to manage brand partnerships.
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
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Brand Partnerships
        </h1>
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#949BA4]">
            Your profile claim is still pending. Once approved you can manage
            brand partnerships here.
          </p>
        </div>
      </div>
    );
  }

  const serialized = serializeBigInt(profile) as unknown as SerializedProfile;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Brand Partnerships
        </h1>
        <p className="mt-2 text-sm text-[#949BA4]">
          Showcase brands you&apos;ve worked with. These are visible on your
          public profile and media kit.
        </p>
      </div>

      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
        <BrandPartnersWidget profile={serialized} isOwner={true} />
      </div>
    </div>
  );
}
