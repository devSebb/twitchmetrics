"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/search";
import { Button, Card } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { RolePicker, type OnboardingRole } from "./RolePicker";

type OnboardingWizardProps = {
  initialName: string | null;
  initialRole: OnboardingRole;
  roleConfirmed?: boolean;
};

export function OnboardingWizard({
  initialName,
  initialRole,
  roleConfirmed = false,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(roleConfirmed ? 2 : 1);
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
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#F2F3F5]">
          What brings you here?
        </h2>
        <RolePicker value={role} onSelect={selectRole} />
        {error ? <p className="text-sm text-[#f87171]">{error}</p> : null}
      </Card>
    );
  }

  if (step === 2) {
    return (
      <Card className="space-y-4">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#F2F3F5]">
          Tell us about yourself
        </h2>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Display name"
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5]"
        />
        <div className="flex gap-3">
          {roleConfirmed ? null : (
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
          )}
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
      <h2 className="font-display text-2xl font-bold tracking-tight text-[#F2F3F5]">
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
