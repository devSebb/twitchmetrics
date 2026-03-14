import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { SettingsForm } from "@/components/settings";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      passwordHash: true,
      creatorProfile: {
        select: {
          slug: true,
          state: true,
          widgetConfig: true,
          platformAccounts: {
            where: { isOAuthConnected: true },
            select: { platform: true },
          },
        },
      },
    },
  });

  const creatorSlug = user?.creatorProfile?.slug ?? null;
  const isClaimed =
    user?.creatorProfile?.state === "claimed" ||
    user?.creatorProfile?.state === "premium";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#F2F3F5]">Settings</h1>
        <p className="mt-2 text-sm text-[#949BA4]">
          Manage your profile, password, and account preferences.
        </p>
      </div>
      <SettingsForm
        name={user?.name ?? null}
        email={user?.email ?? null}
        image={user?.image ?? null}
        hasPassword={Boolean(user?.passwordHash)}
        connectedPlatforms={
          user?.creatorProfile?.platformAccounts.map((item) => item.platform) ??
          []
        }
        creatorSlug={creatorSlug}
        isClaimed={isClaimed}
      />
    </div>
  );
}
