"use client";

import Link from "next/link";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import type { Platform } from "@twitchmetrics/database";

type PlatformAccountInfo = {
  platform: Platform;
  platformUsername: string;
  isOAuthConnected: boolean;
};

type AccountsConnectedProps = {
  accounts: PlatformAccountInfo[];
};

const PLATFORM_ICONS: Record<Platform, string> = {
  twitch: "T",
  youtube: "Y",
  instagram: "I",
  tiktok: "K",
  x: "X",
  kick: "K",
};

export function AccountsConnected({ accounts }: AccountsConnectedProps) {
  const allPlatforms: Platform[] = [
    "twitch",
    "youtube",
    "instagram",
    "tiktok",
    "x",
    "kick",
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-[#DBDEE1]">Accounts Connected</h3>
      <div className="grid grid-cols-3 gap-3">
        {allPlatforms.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          const connected = accounts.find((a) => a.platform === platform);
          return (
            <div
              key={platform}
              className="flex flex-col items-center gap-1.5"
              title={
                connected
                  ? `${config.name}: @${connected.platformUsername}`
                  : `${config.name}: Not connected`
              }
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white transition-opacity"
                style={{
                  backgroundColor: connected ? config.color : "#383A40",
                  opacity: connected ? 1 : 0.4,
                }}
              >
                {PLATFORM_ICONS[platform]}
              </div>
              <span className="text-[10px] text-[#949BA4]">{config.name}</span>
            </div>
          );
        })}
      </div>
      <Link
        href="/dashboard/connections"
        className="inline-block text-xs text-[#93c5fd] hover:underline"
      >
        Manage Connections
      </Link>
    </div>
  );
}
