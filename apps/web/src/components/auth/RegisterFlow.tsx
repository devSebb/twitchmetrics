"use client";

import { useState } from "react";
import { RolePicker, type OnboardingRole } from "@/components/onboarding";
import { RegisterForm } from "./RegisterForm";
import { SocialLoginButtons } from "./SocialLoginButtons";

type SocialProvider = "google" | "twitch";

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
        <p className="text-center text-sm text-[#DBDEE1]">
          First, what brings you here?
        </p>
        <RolePicker value={null} onSelect={setRole} />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-left">
      <div className="flex items-center justify-between rounded-lg border border-[#3F4147] bg-[#2B2D31] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[#949BA4]">
            Signing up as
          </p>
          <p className="truncate text-sm font-semibold text-[#F2F3F5]">
            {ROLE_LABELS[role]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRole(null)}
          className="shrink-0 text-xs text-[#DBDEE1] underline-offset-2 hover:text-white hover:underline"
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
            <div className="h-px flex-1 bg-[#3F4147]" />
            <span className="text-xs uppercase tracking-wide text-[#949BA4]">
              or
            </span>
            <div className="h-px flex-1 bg-[#3F4147]" />
          </div>
        </>
      ) : null}

      <RegisterForm callbackUrl={callbackUrl} role={role} />
    </div>
  );
}
