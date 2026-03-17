"use client";

import Image from "next/image";
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
    iconSrc: "/platform-icons/twitch.png",
  },
  {
    provider: "google",
    label: "YouTube",
    color: "bg-[#ff0000] hover:bg-[#d90404]",
    iconSrc: "/platform-icons/youtube.png",
  },
  {
    provider: "twitter",
    label: "X",
    color: "bg-black hover:bg-[#1a1a1a]",
    iconSrc: "/platform-icons/x.png",
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
          <Image
            src={button.iconSrc}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 flex-shrink-0 object-contain"
          />
          <span>
            {prefix} {button.label}
          </span>
        </button>
      ))}
    </div>
  );
}
