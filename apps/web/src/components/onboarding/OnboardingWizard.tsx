"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/search";
import { Button, Card } from "@/components/ui";
import { trpc } from "@/lib/trpc";

type OnboardingRole = "creator" | "talent_manager";

type OnboardingWizardProps = {
  initialName: string | null;
  initialRole: OnboardingRole;
};

export function OnboardingWizard({
  initialName,
  initialRole,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<OnboardingRole>(initialRole);
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);

  const completeOnboarding = trpc.auth.completeOnboarding.useMutation();

  function selectRole(nextRole: OnboardingRole) {
    setError(null);
    setRole(nextRole);
    setStep(2);
  }

  async function submitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setError(null);
    try {
      await completeOnboarding.mutateAsync({ name: trimmed, role });
      if (role === "creator") {
        setStep(3);
        return;
      }
      router.push("/dashboard/home");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save name.");
    }
  }

  if (step === 1) {
    return (
      <Card className="space-y-4">
        <h2 className="text-2xl font-bold text-[#F2F3F5]">
          What brings you here?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => selectRole("creator")}
            className={`rounded-lg border px-4 py-4 text-left transition-colors ${
              role === "creator"
                ? "border-[#E32C19] bg-[#E32C19]/10"
                : "border-[#3F4147] bg-[#383A40] hover:bg-[#4E5058]"
            }`}
          >
            <p className="text-base font-semibold text-[#F2F3F5]">Creator</p>
            <p className="mt-1 text-xs text-[#949BA4]">
              I create content on Twitch, YouTube, or other platforms. Track
              your growth, build your media kit, and connect with brands.
            </p>
          </button>
          <button
            type="button"
            onClick={() => selectRole("talent_manager")}
            className={`rounded-lg border px-4 py-4 text-left transition-colors ${
              role === "talent_manager"
                ? "border-[#E32C19] bg-[#E32C19]/10"
                : "border-[#3F4147] bg-[#383A40] hover:bg-[#4E5058]"
            }`}
          >
            <p className="text-base font-semibold text-[#F2F3F5]">
              Talent Manager
            </p>
            <p className="mt-1 text-xs text-[#949BA4]">
              I manage creators and talent. Monitor your roster&apos;s
              performance and coordinate campaigns.
            </p>
          </button>
        </div>
        {error ? <p className="text-sm text-[#f87171]">{error}</p> : null}
      </Card>
    );
  }

  if (step === 2) {
    return (
      <Card className="space-y-4">
        <h2 className="text-2xl font-bold text-[#F2F3F5]">
          Tell us about yourself
        </h2>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Display name"
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5]"
        />
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setStep(1)}>
            Back
          </Button>
          <Button onClick={submitName} disabled={completeOnboarding.isPending}>
            {completeOnboarding.isPending ? "Saving..." : "Continue"}
          </Button>
        </div>
        {error ? <p className="text-sm text-[#f87171]">{error}</p> : null}
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-2xl font-bold text-[#F2F3F5]">
        Already tracked by TwitchMetrics?
      </h2>
      <p className="text-sm text-[#949BA4]">
        If we&apos;ve already been importing your channel data, you can merge it
        with your account. You can always do this later from your dashboard.
      </p>
      <SearchBar mode="full" />
      <div className="flex gap-3">
        <Button
          onClick={() => {
            router.push("/dashboard/home");
            router.refresh();
          }}
        >
          Go to dashboard
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push("/dashboard/claim")}
        >
          Search for existing profile
        </Button>
      </div>
    </Card>
  );
}
