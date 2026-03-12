"use client";

import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils";

type SocialLoginButtonsProps = {
  callbackUrl?: string;
  mode?: "login" | "register";
};

const BUTTONS = [
  {
    provider: "twitch",
    label: "Twitch",
    color: "bg-[#9146ff] hover:bg-[#7f39e0]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        <path d="M2 1h20v14l-4 4h-4l-3 3h-3v-3H2V1zm18 13V3H4v14h5v3l3-3h5l3-3z" />
        <path d="M14 6h2v6h-2V6zm-5 0h2v6H9V6z" />
      </svg>
    ),
  },
  {
    provider: "google",
    label: "YouTube",
    color: "bg-[#ff0000] hover:bg-[#d90404]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        <path d="M23 7.5a4 4 0 0 0-2.8-2.8C17.8 4 12 4 12 4s-5.8 0-8.2.7A4 4 0 0 0 1 7.5 41 41 0 0 0 1 16.5a4 4 0 0 0 2.8 2.8C6.2 20 12 20 12 20s5.8 0 8.2-.7a4 4 0 0 0 2.8-2.8A41 41 0 0 0 23 7.5zM10 15V9l5 3-5 3z" />
      </svg>
    ),
  },
  {
    provider: "twitter",
    label: "X",
    color: "bg-black hover:bg-[#1a1a1a]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        <path d="M18.9 2H22l-6.8 7.8L23.3 22h-6.4l-5-6-5.2 6H3.6l7.3-8.5L1 2h6.5l4.5 5.4L18.9 2zm-1.1 18h1.8L6.5 3.9H4.6L17.8 20z" />
      </svg>
    ),
  },
] as const;

export function SocialLoginButtons({
  callbackUrl = "/home",
  mode = "login",
}: SocialLoginButtonsProps) {
  const prefix = mode === "register" ? "Sign up with" : "Continue with";

  return (
    <div className="space-y-3">
      {BUTTONS.map((button) => (
        <button
          key={button.provider}
          type="button"
          onClick={() => signIn(button.provider, { callbackUrl })}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors",
            button.color,
          )}
        >
          {button.icon}
          <span>
            {prefix} {button.label}
          </span>
        </button>
      ))}
    </div>
  );
}
