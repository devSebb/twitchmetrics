"use client";

import type { Platform } from "@/lib/constants/platforms";
import type { PlatformConfigEntry } from "@/lib/constants/platforms";
import { cn } from "@/lib/utils";

type PlatformConnection = {
  isConnected: boolean;
  username: string | null;
  followerCount: string | null;
  lastSyncedAt: string | null;
  tokenExpiresAt: string | null;
};

type PlatformCardProps = {
  platform: Platform;
  config: PlatformConfigEntry;
  connection: PlatformConnection | null;
  oauthProviderReady: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function formatFollowers(value: string | null): string {
  if (!value) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("en-US").format(numeric);
}

export function PlatformCard({
  platform,
  config,
  connection,
  oauthProviderReady,
  onConnect,
  onDisconnect,
}: PlatformCardProps) {
  const isConnected = Boolean(connection?.isConnected);
  const isKick = platform === "kick";
  const showBetaBadge = platform === "instagram" || platform === "tiktok";
  const isUnavailable = isKick || !config.oauthSupported || !oauthProviderReady;

  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: config.color }}
          />
          <h3 className="text-base font-semibold text-[#F2F3F5]">
            {config.name}
          </h3>
          {showBetaBadge && (
            <span className="rounded bg-[#383A40] px-2 py-0.5 text-xs text-[#DBDEE1]">
              Beta
            </span>
          )}
        </div>
        <span
          className={cn(
            "text-xs font-medium",
            isConnected ? "text-[#4ade80]" : "text-[#949BA4]",
          )}
        >
          {isConnected ? "Connected" : "Not connected"}
        </span>
      </div>

      {showBetaBadge && platform === "instagram" && (
        <p className="mt-2 text-xs text-[#949BA4]">
          Requires a Business or Creator account linked to a Facebook Page.
        </p>
      )}

      {showBetaBadge && platform === "tiktok" && !oauthProviderReady && (
        <p className="mt-2 text-xs text-[#949BA4]">
          TikTok OAuth app approval is pending. Coming soon.
        </p>
      )}

      <div className="mt-4 space-y-1 text-sm text-[#DBDEE1]">
        <p>
          Username:{" "}
          <span className="text-[#949BA4]">{connection?.username ?? "-"}</span>
        </p>
        <p>
          Followers:{" "}
          <span className="text-[#949BA4]">
            {formatFollowers(connection?.followerCount ?? null)}
          </span>
        </p>
        <p>
          Last synced:{" "}
          <span className="text-[#949BA4]">
            {formatDate(connection?.lastSyncedAt ?? null)}
          </span>
        </p>
      </div>

      <div className="mt-4">
        {isConnected ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4A4D55]"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={isUnavailable}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              isUnavailable
                ? "cursor-not-allowed bg-[#383A40] text-[#949BA4]"
                : "bg-[#E32C19] text-white hover:bg-[#C72615]",
            )}
          >
            {isKick ? "Coming Soon" : `Connect ${config.name}`}
          </button>
        )}
      </div>
    </div>
  );
}
