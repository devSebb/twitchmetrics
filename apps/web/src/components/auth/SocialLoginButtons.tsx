"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils";

type SocialLoginButtonsProps = {
  callbackUrl?: string;
  mode?: "login" | "register";
};

const PROVIDERS = [
  {
    provider: "twitch",
    label: "Twitch",
    iconSrc: "/platform-icons/twitch.png",
  },
  {
    provider: "google",
    label: "YouTube",
    iconSrc: "/platform-icons/youtube.png",
  },
  {
    provider: "twitter",
    label: "X",
    iconSrc: "/platform-icons/x.png",
  },
] as const;

export function SocialLoginButtons({
  callbackUrl = "/home",
  mode = "login",
}: SocialLoginButtonsProps) {
  const heading = mode === "register" ? "Sign up with" : "Sign in with";

  return (
    <div className="space-y-3 text-left">
      <p className="text-center text-xs uppercase tracking-[0.16em] text-[#949BA4]">
        {heading}
      </p>
      <ul className="space-y-2" role="list">
        {PROVIDERS.map((item) => (
          <li key={item.provider}>
            <button
              type="button"
              onClick={() => signIn(item.provider, { callbackUrl })}
              aria-label={`${heading} ${item.label}`}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-4 py-3 text-left transition-colors",
                "hover:border-[#4E5058] hover:bg-[#383A40]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#313338]",
                "active:bg-[#3F4147]",
              )}
            >
              <Image
                src={item.iconSrc}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 flex-shrink-0 object-contain"
                aria-hidden
              />
              <span className="text-sm font-semibold text-[#F2F3F5]">
                {item.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
