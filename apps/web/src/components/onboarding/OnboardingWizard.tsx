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
      <Card appearance="noticed" className="space-y-4">
        <h2 className="font-display text-2xl font-bold tracking-tight text-n-ink">
          What brings you here?
        </h2>
        <RolePicker value={role} onSelect={selectRole} />
        {error ? <p className="text-sm text-n-error">{error}</p> : null}
      </Card>
    );
  }

  if (step === 2) {
    return (
      <Card appearance="noticed" className="space-y-4">
        <h2 className="font-display text-2xl font-bold tracking-tight text-n-ink">
          Tell us about yourself
        </h2>
        <label htmlFor="onboarding-name" className="block text-sm font-medium">
          Display name
        </label>
        <input
          id="onboarding-name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Display name"
          className="w-full rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink"
        />
        <div className="flex flex-wrap gap-3">
          {roleConfirmed ? null : (
            <Button
              appearance="noticed"
              variant="secondary"
              onClick={() => setStep(1)}
            >
              Back
            </Button>
          )}
          <Button
            appearance="noticed"
            onClick={submitName}
            disabled={completeOnboarding.isPending}
          >
            {completeOnboarding.isPending ? "Saving..." : "Continue"}
          </Button>
        </div>
        {error ? <p className="text-sm text-n-error">{error}</p> : null}
      </Card>
    );
  }

  return (
    <Card appearance="noticed" className="space-y-4">
      <h2 className="font-display text-2xl font-bold tracking-tight text-n-ink">
        Already tracked by Noticed?
      </h2>
      <p className="text-sm text-n-slate">
        If we&apos;ve already been importing your channel data, you can merge it
        with your account. You can always do this later from your dashboard.
      </p>
      <SearchBar mode="full" appearance="noticed" />
      <div className="flex flex-wrap gap-3">
        <Button
          appearance="noticed"
          onClick={() => {
            router.push("/dashboard/home");
            router.refresh();
          }}
        >
          Go to dashboard
        </Button>
        <Button
          appearance="noticed"
          variant="secondary"
          onClick={() => router.push("/dashboard/claim")}
        >
          Search for existing profile
        </Button>
      </div>
    </Card>
  );
}
