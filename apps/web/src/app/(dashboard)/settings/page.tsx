import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { getSession } from "@/server/auth-cache";

export const metadata: Metadata = {
  title: "Profile Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      creatorProfile: {
        select: {
          displayName: true,
          slug: true,
          state: true,
          bio: true,
          country: true,
          gender: true,
          language: true,
          age: true,
          interests: true,
          avatarUrl: true,
          platformAccounts: {
            select: {
              platform: true,
              platformUsername: true,
              platformAvatarUrl: true,
              isOAuthConnected: true,
            },
          },
          brandPartnerships: {
            where: { isPublic: true },
            select: {
              id: true,
              brandName: true,
              brandLogoUrl: true,
            },
            orderBy: { createdAt: "desc" },
            take: 12,
          },
        },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const profile = user.creatorProfile;
  const interests = (profile?.interests ?? []) as string[];

  return (
    <ProfileSettingsForm
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
      }}
      profile={
        profile
          ? {
              displayName: profile.displayName,
              slug: profile.slug,
              state: profile.state,
              bio: profile.bio,
              country: profile.country,
              gender: profile.gender,
              language: profile.language,
              age: profile.age,
              interests,
              avatarUrl: profile.avatarUrl,
            }
          : null
      }
      platformAccounts={
        profile?.platformAccounts.map((a) => ({
          platform: a.platform,
          platformUsername: a.platformUsername,
          avatarUrl: a.platformAvatarUrl,
          isOAuthConnected: a.isOAuthConnected,
        })) ?? []
      }
      partnerships={
        profile?.brandPartnerships.map((p) => ({
          id: p.id,
          brandName: p.brandName,
          brandLogoUrl: p.brandLogoUrl,
        })) ?? []
      }
    />
  );
}
