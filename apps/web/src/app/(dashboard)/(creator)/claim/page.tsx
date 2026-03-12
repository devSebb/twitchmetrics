import { SearchBar } from "@/components/search";
import { ClaimFlow } from "@/components/claim";
import { prisma } from "@twitchmetrics/database";

type ClaimPageProps = {
  searchParams: Promise<{ profile?: string }>;
};

export default async function ClaimProfilePage({
  searchParams,
}: ClaimPageProps) {
  const params = await searchParams;
  const profileId = params.profile;

  if (!profileId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Claim Your Profile
        </h1>
        <p className="text-sm text-[#949BA4]">
          Search for your profile and begin verification.
        </p>
        <SearchBar mode="full" autoFocus />
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
      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
        <h1 className="text-2xl font-bold text-[#F2F3F5]">
          Claim Your Profile
        </h1>
        <p className="mt-2 text-sm text-[#f87171]">Profile not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
      />
    </div>
  );
}
