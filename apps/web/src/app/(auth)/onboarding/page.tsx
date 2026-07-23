import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { OnboardingWizard } from "@/components/onboarding";
import { auth } from "@/lib/auth";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.hasCompletedOnboarding) {
    redirect("/dashboard/home");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, role: true, roleSelectedAt: true },
  });

  const dbRole = user?.role ?? session.user.role ?? "creator";
  const initialRole: "creator" | "talent_manager" =
    dbRole === "talent_manager" ? "talent_manager" : "creator";
  const roleConfirmed = Boolean(user?.roleSelectedAt);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F2F3F5]">
          Welcome to TwitchMetrics
        </h1>
        <p className="text-sm text-[#949BA4]">
          Let&apos;s set up your account.
        </p>
      </div>
      <OnboardingWizard
        initialName={user?.name ?? session.user.name ?? null}
        initialRole={initialRole}
        roleConfirmed={roleConfirmed}
      />
    </div>
  );
}
