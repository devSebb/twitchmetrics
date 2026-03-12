import { redirect } from "next/navigation";
import { UserRole } from "@twitchmetrics/database";
import { OnboardingWizard } from "@/components/onboarding";
import { auth } from "@/lib/auth";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.name && session.user.name.trim().length > 0) {
    redirect("/dashboard/home");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Welcome to TwitchMetrics
        </h1>
        <p className="text-sm text-[#949BA4]">
          Let&apos;s set up your account.
        </p>
      </div>
      <OnboardingWizard
        initialName={session.user.name ?? null}
        initialRole={(session.user.role as UserRole | undefined) ?? "creator"}
      />
    </div>
  );
}
