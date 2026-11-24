"use client";

import { useState } from "react";
import { RolePicker, type OnboardingRole } from "@/components/onboarding";
import { RegisterForm } from "./RegisterForm";
import { SocialLoginButtons } from "./SocialLoginButtons";

type SocialProvider = "google" | "twitch" | "kick" | "tiktok";

type RegisterFlowProps = {
  callbackUrl: string;
  socialProviders: readonly SocialProvider[];
};

const ROLE_LABELS: Record<OnboardingRole, string> = {
  creator: "Creator",
  talent_manager: "Talent Manager",
};

export function RegisterFlow({
  callbackUrl,
  socialProviders,
}: RegisterFlowProps) {
  const [role, setRole] = useState<OnboardingRole | null>(null);

  if (!role) {
    return (
      <div className="space-y-5 text-left">
        <p className="text-center text-sm text-n-ink">
          First, what brings you here?
        </p>
        <RolePicker value={null} onSelect={setRole} />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-left">
      <div className="flex items-center justify-between rounded-lg border border-n-line bg-n-surface px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-n-slate">
            Signing up as
          </p>
          <p className="truncate text-sm font-semibold text-n-ink">
            {ROLE_LABELS[role]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRole(null)}
          className="shrink-0 text-xs text-n-ink underline-offset-2 hover:text-n-ink hover:underline"
        >
          Change
        </button>
      </div>

      {socialProviders.length > 0 ? (
        <>
          <SocialLoginButtons
            callbackUrl={callbackUrl}
            enabledProviders={socialProviders}
            mode="register"
          />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-n-line" />
            <span className="text-xs uppercase tracking-wide text-n-slate">
              or
            </span>
            <div className="h-px flex-1 bg-n-line" />
          </div>
        </>
      ) : null}

      <RegisterForm callbackUrl={callbackUrl} role={role} />
    </div>
  );
}
