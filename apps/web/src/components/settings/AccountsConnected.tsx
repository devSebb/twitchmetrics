"use client";

import { PlatformIcon } from "@/components/shared";
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

const PLATFORM_ORDER: readonly Platform[] = [
  "twitch",
  "youtube",
  "instagram",
  "tiktok",
  "x",
  "kick",
];

export function AccountsConnected({ accounts }: AccountsConnectedProps) {
  const connectedByPlatform = new Map(
    accounts.map((account) => [account.platform, account] as const),
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-n-ink">Accounts Connected</h3>
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
                className={`flex h-12 w-12 items-center justify-center rounded-full border ${isConnected ? "border-n-success/40 bg-n-success/5" : "border-n-line"}`}
              >
                <PlatformIcon platform={platform} size="md" />
              </div>
              <span className="text-xs text-n-slate">{config.name}</span>
              <span
                className={`text-xs ${isConnected ? "text-n-success" : "text-n-slate"}`}
              >
                {isConnected ? "Connected" : "Not linked"}
              </span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/dashboard/connections"
        className="inline-block text-xs text-n-navy hover:underline"
      >
        Manage Connections
      </Link>
    </div>
  );
}
