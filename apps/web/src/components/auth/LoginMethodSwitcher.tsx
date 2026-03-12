"use client";

import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { MagicLinkForm } from "./MagicLinkForm";

type LoginMethodSwitcherProps = {
  callbackUrl?: string;
};

export function LoginMethodSwitcher({
  callbackUrl = "/home",
}: LoginMethodSwitcherProps) {
  const [showMagicLink, setShowMagicLink] = useState(false);

  return (
    <div className="space-y-3">
      {showMagicLink ? (
        <MagicLinkForm callbackUrl={callbackUrl} />
      ) : (
        <LoginForm callbackUrl={callbackUrl} />
      )}

      <button
        type="button"
        onClick={() => setShowMagicLink((value) => !value)}
        className="text-sm text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
      >
        {showMagicLink
          ? "Use email + password instead"
          : "Or sign in with a magic link"}
      </button>
    </div>
  );
}
