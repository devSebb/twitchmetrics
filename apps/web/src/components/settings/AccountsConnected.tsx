"use client";

import Image from "next/image";
import Link from "next/link";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { cn } from "@/lib/utils";
import type { Platform } from "@twitchmetrics/database";

type PlatformAccountInfo = {
  platform: Platform;
  platformUsername: string;
  isOAuthConnected: boolean;
};

type AccountsConnectedProps = {
  accounts: PlatformAccountInfo[];
};

const PLATFORM_ORDER: readonly Platform[] = [
  "twitch",
  "youtube",
  "instagram",
  "tiktok",
  "x",
  "kick",
];

const PLATFORM_ICON_SRC: Record<Platform, string> = {
  twitch: "/platform-icons/twitch.png",
  youtube: "/platform-icons/youtube.png",
  instagram: "/platform-icons/instagram.png",
  tiktok: "/platform-icons/tiktok.png",
  x: "/platform-icons/x_white.png",
  kick: "/platform-icons/kick.png",
};

const DISCONNECTED_BORDER = "#3F4147";

export function AccountsConnected({ accounts }: AccountsConnectedProps) {
  const connectedByPlatform = new Map(
    accounts.map((account) => [account.platform, account] as const),
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-[#DBDEE1]">Accounts Connected</h3>
      <ul className="grid grid-cols-3 gap-3" role="list">
        {PLATFORM_ORDER.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          const connected = connectedByPlatform.get(platform);
          const isConnected = Boolean(connected?.isOAuthConnected);

          return (
            <li
              key={platform}
              className="flex flex-col items-center gap-1.5"
              title={
                connected
                  ? `${config.name}: @${connected.platformUsername}`
                  : `${config.name}: Not connected`
              }
            >
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border-[3px] transition-all",
                  !isConnected && "opacity-50 grayscale",
                )}
                style={{
                  borderColor: isConnected ? config.color : DISCONNECTED_BORDER,
                }}
                aria-hidden
              >
                <Image
                  src={PLATFORM_ICON_SRC[platform]}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 object-contain"
                />
              </div>
              <span className="text-[10px] text-[#949BA4]">{config.name}</span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/dashboard/connections"
        className="inline-block text-xs text-[#93c5fd] hover:underline"
      >
        Manage Connections
      </Link>
    </div>
  );
}
