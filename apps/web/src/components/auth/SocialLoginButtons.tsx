"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils";

type SocialLoginButtonsProps = {
  callbackUrl?: string;
  mode?: "login" | "register";
  enabledProviders?: readonly ProviderId[];
};

/** Login/register only — each provider is filtered by configured credentials. */
const PROVIDERS = [
  {
    provider: "google",
    label: "YouTube",
    iconSrc: "/platform-icons/youtube.png",
    bgColor: null,
  },
  {
    provider: "twitch",
    label: "Twitch",
    iconSrc: "/platform-icons/twitch.png",
    bgColor: null,
  },
  {
    provider: "kick",
    label: "Kick",
    iconSrc: "/platform-icons/kick.png",
    bgColor: "#53fc18",
  },
  {
    provider: "tiktok",
    label: "TikTok",
    iconSrc: "/platform-icons/tiktok.png",
    bgColor: "#000000",
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["provider"];

const LOGO_PX = 52;

export function SocialLoginButtons({
  callbackUrl = "/home",
  mode = "login",
  enabledProviders = PROVIDERS.map((provider) => provider.provider),
}: SocialLoginButtonsProps) {
  const heading = mode === "register" ? "Sign up with" : "Sign in with";
  const enabledProviderSet = new Set(enabledProviders);
  const visibleProviders = PROVIDERS.filter((provider) =>
    enabledProviderSet.has(provider.provider),
  );

  return (
    <div className="space-y-4">
      <p className="text-center text-xs uppercase tracking-[0.16em] text-[#949BA4]">
        {heading}
      </p>
      <ul
        className="m-0 flex list-none flex-wrap items-start justify-center gap-x-8 gap-y-5 p-0 sm:gap-x-10"
        role="list"
      >
        {visibleProviders.map((item) => (
          <li key={item.provider}>
            <button
              type="button"
              onClick={() => signIn(item.provider, { callbackUrl })}
              aria-label={`${heading} ${item.label}`}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl px-1 pt-1 pb-0.5 transition-transform",
                "hover:scale-[1.03] active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#313338]",
              )}
            >
              {item.bgColor ? (
                <div
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[3px]"
                  style={{ borderColor: item.bgColor }}
                  aria-hidden
                >
                  <Image
                    src={item.iconSrc}
                    alt=""
                    width={LOGO_PX}
                    height={LOGO_PX}
                    className="h-[30px] w-[30px] object-contain"
                  />
                </div>
              ) : (
                <Image
                  src={item.iconSrc}
                  alt=""
                  width={LOGO_PX}
                  height={LOGO_PX}
                  className="h-[52px] w-[52px] shrink-0 object-contain"
                  aria-hidden
                />
              )}
              <span className="text-center text-sm font-bold tracking-tight text-[#F2F3F5]">
                {item.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
