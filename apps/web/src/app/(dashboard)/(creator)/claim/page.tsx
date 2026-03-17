import { ClaimFlow, ClaimSearchBar, MyClaimsHistory } from "@/components/claim";
import { prisma } from "@twitchmetrics/database";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claim Profile",
  robots: { index: false, follow: false },
};

type ClaimPageProps = {
  searchParams: Promise<{ profile?: string; resume?: string }>;
};

export default async function ClaimProfilePage({
  searchParams,
}: ClaimPageProps) {
  const params = await searchParams;
  const profileId = params.profile;
  const resumeOAuth = params.resume === "oauth";

  if (!profileId) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold text-[#F2F3F5]">
            Claim Your Profile
          </h1>
          <p className="mt-2 text-sm text-[#949BA4]">
            Search for your creator profile, verify ownership, and unlock
            analytics and creator tools.
          </p>
        </div>
        <ClaimSearchBar />
        <MyClaimsHistory />
      </div>
    );
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      slug: true,
      primaryPlatform: true,
      totalFollowers: true,
    },
  });

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <h1 className="text-2xl font-bold text-[#F2F3F5]">
            Claim Your Profile
          </h1>
          <p className="mt-2 text-sm text-[#f87171]">
            Profile not found. It may have been removed or the link is invalid.
          </p>
        </div>
        <ClaimSearchBar />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold text-[#F2F3F5]">Claim Your Profile</h1>
      <ClaimFlow
        profile={{
          id: profile.id,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          slug: profile.slug,
          primaryPlatform: profile.primaryPlatform,
          totalFollowers: profile.totalFollowers.toString(),
        }}
        autoResumeOAuth={resumeOAuth}
      />
    </div>
  );
}
