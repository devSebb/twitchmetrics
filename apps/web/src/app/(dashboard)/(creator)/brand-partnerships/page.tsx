import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { getSession } from "@/server/auth-cache";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { BrandPartnersWidget } from "@/components/widgets";
import { Button } from "@/components/ui";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

export const metadata: Metadata = {
  title: "Brand Partnerships",
  robots: { index: false, follow: false },
};

export default async function BrandPartnershipsPage() {
  const session = await getSession();
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
      <div className="mx-auto max-w-[1280px] space-y-4 px-5 py-10 sm:px-8 lg:px-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-n-ink">
          Brand Partnerships
        </h1>
        <div className="rounded-lg border border-n-line bg-white p-6">
          <p className="text-sm text-n-slate">
            Claim a creator profile to manage brand partnerships.
          </p>
          <Link href="/dashboard/claim" className="mt-4 inline-block">
            <Button appearance="noticed">Claim a Profile</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isClaimed = profile.state === "claimed" || profile.state === "premium";

  if (!isClaimed) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-4 px-5 py-10 sm:px-8 lg:px-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-n-ink">
          Brand Partnerships
        </h1>
        <div className="rounded-lg border border-n-line bg-white p-6">
          <p className="text-sm text-n-slate">
            Your profile claim is still pending. Once approved you can manage
            brand partnerships here.
          </p>
        </div>
      </div>
    );
  }

  const serialized = serializeBigInt(profile) as unknown as SerializedProfile;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-5 py-10 sm:px-8 lg:px-10">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-n-ink">
          Brand Partnerships
        </h1>
        <p className="mt-2 text-sm text-n-slate">
          Showcase brands you&apos;ve worked with. These are visible on your
          public profile and media kit.
        </p>
      </div>

      <div className="rounded-xl border border-n-line bg-white p-6">
        <BrandPartnersWidget profile={serialized} isOwner={true} />
      </div>
    </div>
  );
}
