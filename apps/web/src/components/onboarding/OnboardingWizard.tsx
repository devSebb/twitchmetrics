"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@twitchmetrics/database";
import { SearchBar } from "@/components/search";
import { Button, Card } from "@/components/ui";
import { trpc } from "@/lib/trpc";

type OnboardingWizardProps = {
  initialName: string | null;
  initialRole: UserRole;
};

export function OnboardingWizard({
  initialName,
  initialRole,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);

  const updateRole = trpc.auth.updateRole.useMutation();
  const completeOnboarding = trpc.auth.completeOnboarding.useMutation();

  async function submitRole(nextRole: UserRole) {
    setError(null);
    setRole(nextRole);
    try {
      await updateRole.mutateAsync({ role: nextRole });
      setStep(2);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to update role.",
      );
    }
  }

  async function submitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setError(null);
    try {
      await completeOnboarding.mutateAsync({ name: trimmed });
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
        <div className="grid gap-3 sm:grid-cols-3">
          <Button onClick={() => submitRole("creator")}>Creator</Button>
          <Button
            variant="secondary"
            onClick={() => submitRole("talent_manager")}
          >
            Talent Manager
          </Button>
          <Button variant="secondary" onClick={() => submitRole("brand")}>
            Brand / Agency
          </Button>
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
      <h2 className="text-2xl font-bold text-[#F2F3F5]">Find your profile</h2>
      <p className="text-sm text-[#949BA4]">
        Search for your creator profile and claim it to unlock analytics.
      </p>
      <SearchBar mode="full" />
      <div className="flex gap-3">
        <Link href="/dashboard/claim">
          <Button>Go to claim flow</Button>
        </Link>
        <Button
          variant="secondary"
          onClick={() => router.push("/dashboard/home")}
        >
          Skip for now
        </Button>
      </div>
      {error ? <p className="text-sm text-[#f87171]">{error}</p> : null}
    </Card>
  );
}
