"use client";

import type { Platform } from "@/lib/constants/platforms";
import type { PlatformConfigEntry } from "@/lib/constants/platforms";
import { cn } from "@/lib/utils";
import { getSafePlatformProfileUrl } from "@/lib/platform-profile-url";

type PlatformConnection = {
  isConnected: boolean;
  username: string | null;
  displayName: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  platformUserId: string;
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
  const profileUrl = getSafePlatformProfileUrl(
    platform,
    connection?.profileUrl,
  );
  const isConnected = Boolean(connection?.isConnected);
  const showBetaBadge =
    platform === "instagram" || platform === "tiktok" || platform === "youtube";
  const isUnavailable = !config.oauthSupported || !oauthProviderReady;
  const connectedUsername =
    isConnected && connection?.username ? connection.username : null;
  const connectedDisplayName =
    isConnected && connection?.displayName ? connection.displayName : null;

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
            <span className="group/beta relative inline-flex">
              <span className="cursor-default rounded bg-[#383A40] px-2 py-0.5 text-xs text-[#DBDEE1]">
                Beta
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-52 -translate-x-1/2 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-3 py-2 text-xs leading-relaxed text-[#B5BAC1] opacity-0 shadow-lg transition-opacity duration-150 group-hover/beta:opacity-100"
              >
                This connection is still under construction — it may not work
                reliably for every account just yet.
              </span>
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

      {isConnected && connection ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#2B2D31] p-3">
          {connection.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={connection.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#383A40] text-sm font-semibold text-[#DBDEE1]">
              {config.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#F2F3F5]">
              {connectedDisplayName ?? connectedUsername ?? config.name}
            </p>
            {connectedUsername ? (
              profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-[#93c5fd] hover:underline"
                >
                  @{connectedUsername}
                </a>
              ) : (
                <p className="truncate text-xs text-[#949BA4]">
                  @{connectedUsername}
                </p>
              )
            ) : (
              <p className="truncate text-xs text-[#949BA4]">
                ID: {connection.platformUserId}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-1 text-sm text-[#DBDEE1]">
        <p>
          Username:{" "}
          <span className="text-[#949BA4]">
            {connectedUsername ? `@${connectedUsername}` : "-"}
          </span>
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
            {`Connect ${config.name}`}
          </button>
        )}
      </div>
    </div>
  );
}
