"use client";

import type { Platform } from "@/lib/constants/platforms";
import type { PlatformConfigEntry } from "@/lib/constants/platforms";
import { PlatformIcon } from "@/components/shared";
import { cn } from "@/lib/utils";
import { getPlatformProfileUrl } from "@/lib/platform-profile-url";

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
  isBusy?: boolean;
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
  isBusy = false,
  onConnect,
  onDisconnect,
}: PlatformCardProps) {
  const profileUrl = getPlatformProfileUrl(
    platform,
    connection?.profileUrl,
    connection?.username,
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
    <div className="min-w-0 border-t border-n-line bg-white py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PlatformIcon platform={platform} size="md" />
          <h3 className="text-base font-semibold text-n-ink">{config.name}</h3>
          {showBetaBadge && (
            <span tabIndex={0} className="group/beta relative inline-flex">
              <span className="cursor-default rounded bg-n-surface px-2 py-0.5 text-xs text-n-ink">
                Beta
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-52 -translate-x-1/2 rounded-lg border border-n-line bg-n-surface px-3 py-2 text-xs leading-relaxed text-n-slate opacity-0 shadow-lg transition-opacity duration-150 group-hover/beta:opacity-100 group-focus/beta:opacity-100"
              >
                This connection is still under construction. it may not work
                reliably for every account just yet.
              </span>
            </span>
          )}
        </div>
        <span
          className={cn(
            "text-xs font-medium",
            isConnected ? "text-n-success" : "text-n-slate",
          )}
        >
          {isConnected ? "Connected" : "Not connected"}
        </span>
      </div>

      {showBetaBadge && platform === "instagram" && (
        <p className="mt-2 text-xs text-n-slate">
          Requires a Business or Creator account linked to a Facebook Page.
        </p>
      )}

      {showBetaBadge && platform === "tiktok" && !oauthProviderReady && (
        <p className="mt-2 text-xs text-n-slate">
          TikTok OAuth app approval is pending. Coming soon.
        </p>
      )}

      {isConnected && connection ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-n-line bg-n-surface p-3">
          {connection.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={connection.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-n-surface text-sm font-semibold text-n-ink">
              {config.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-n-ink">
              {connectedDisplayName ?? connectedUsername ?? config.name}
            </p>
            {connectedUsername ? (
              profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-n-navy hover:underline"
                >
                  @{connectedUsername}
                </a>
              ) : (
                <p className="truncate text-xs text-n-slate">
                  @{connectedUsername}
                </p>
              )
            ) : (
              <p className="truncate text-xs text-n-slate">
                ID: {connection.platformUserId}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-1 text-sm text-n-ink">
        <p>
          Username:{" "}
          <span className="text-n-slate">
            {connectedUsername ? `@${connectedUsername}` : "-"}
          </span>
        </p>
        <p>
          Followers:{" "}
          <span className="text-n-slate">
            {formatFollowers(connection?.followerCount ?? null)}
          </span>
        </p>
        <p>
          Last synced:{" "}
          <span className="text-n-slate">
            {formatDate(connection?.lastSyncedAt ?? null)}
          </span>
        </p>
      </div>

      <div className="mt-4">
        {isConnected ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={onDisconnect}
            className="w-full rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm font-semibold text-n-ink transition-colors hover:bg-n-surface"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={isUnavailable || isBusy}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              isUnavailable
                ? "cursor-not-allowed bg-n-surface text-n-slate"
                : "bg-n-red text-white hover:bg-n-red-hover",
            )}
          >
            {`Connect ${config.name}`}
          </button>
        )}
      </div>
    </div>
  );
}
