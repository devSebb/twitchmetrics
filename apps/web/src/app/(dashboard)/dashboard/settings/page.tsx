import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { ManagerSettingsForm } from "@/components/settings/manager/ManagerSettingsForm";
import { ROSTER_ACTIVE_FILTER } from "@/server/services/roster-access";
import { getSession } from "@/server/auth-cache";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = session.user.role;

  // ── Talent manager branch ──
  if (role === "talent_manager") {
    const userId = session.user.id;

    const [user, profile, activeRosterCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, image: true },
      }),
      // Upsert defensively — onboarding seeds this row, but a TM that
      // predates the schema (or a backfill miss) should still get a row.
      prisma.talentManagerProfile.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: {
          agencyName: true,
          bio: true,
          websiteUrl: true,
          country: true,
          languages: true,
          contactEmail: true,
        },
      }),
      prisma.talentManagerAccess.count({
        where: { managerId: userId, ...ROSTER_ACTIVE_FILTER },
      }),
    ]);

    if (!user) {
      redirect("/login");
    }

    return (
      <ManagerSettingsForm
        user={{ name: user.name, email: user.email, image: user.image }}
        profile={profile}
        activeRosterCount={activeRosterCount}
      />
    );
  }

  // ── Creator / admin branch (unchanged) ──
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
