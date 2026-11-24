"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, Button } from "@/components/ui";
import {
  PLATFORM_CONFIG,
  sortByPlatformOrder,
  type Platform,
} from "@/lib/constants/platforms";
import { PlatformIcon } from "@/components/shared";
import {
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";

type GrowthRollup = {
  platform: Platform;
  delta7d: bigint | string | number | null;
  pct7d: number | null;
  trendDirection: string | null;
};

type PlatformAccount = {
  platform: Platform;
  platformUsername: string;
};

type Creator = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  primaryPlatform: Platform | null;
  totalFollowers: bigint | string | number | null;
  state: string;
  lastSnapshotAt: string | Date | null;
  growthRollups: GrowthRollup[];
  platformAccounts: PlatformAccount[];
};

export type InviteState = "active" | "pending" | "expired";

type CreatorRosterCardProps = {
  creator: Creator;
  accessId: string;
  inviteState: InviteState;
  grantedAt: string | Date;
  inviteExpiresAt: string | Date | null;
  onRemove: () => void;
  isRemoving: boolean;
};

export function CreatorRosterCard({
  creator,
  accessId,
  inviteState,
  grantedAt,
  inviteExpiresAt,
  onRemove,
  isRemoving,
}: CreatorRosterCardProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const avatarSrc = getSafeImageSrc(creator.avatarUrl);
  const primaryGrowth =
    creator.growthRollups.find((g) => g.platform === creator.primaryPlatform) ??
    creator.growthRollups[0];

  // Color from the actual value so a loss never renders green.
  const trendUp = primaryGrowth?.pct7d != null && primaryGrowth.pct7d > 0;
  const trendDown = primaryGrowth?.pct7d != null && primaryGrowth.pct7d < 0;

  const regenerateMutation = trpc.talentManager.regenerateInvite.useMutation({
    onSuccess: (data) => {
      setRegeneratedUrl(data.inviteUrl);
    },
  });

  const isPending = inviteState === "pending";
  const isExpired = inviteState === "expired";
  const isActive = inviteState === "active";

  // Click target: active rows go to the private manager detail page (gated by
  // ROSTER_ACTIVE_FILTER server-side); pending/expired go to the public profile.
  const profileHref = isActive
    ? `/talent-manager/creator/${creator.slug}`
    : `/creator/${creator.slug}`;

  const handleRemoveClick = () => {
    if (confirmingRemove) {
      onRemove();
      setConfirmingRemove(false);
    } else {
      setConfirmingRemove(true);
    }
  };

  const handleRegenerate = () => {
    regenerateMutation.mutate({ accessId });
  };

  const handleCopyUrl = async () => {
    if (!regeneratedUrl) return;
    try {
      await navigator.clipboard.writeText(regeneratedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable.
    }
  };

  return (
    <Card
      appearance="noticed"
      className={cn(
        "flex flex-col transition-colors",
        isActive && "hover:border-n-ink/40",
        isPending && "border-dashed border-n-line bg-white/60",
        isExpired && "border-dashed border-n-line bg-white/40 opacity-90",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Link href={profileHref} className="shrink-0">
          {avatarSrc ? (
            <Image
              src={avatarSrc}
              alt={creator.displayName}
              width={48}
              height={48}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-n-surface text-lg font-bold text-n-ink">
              {creator.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={profileHref}
              className="truncate text-sm font-semibold text-n-ink hover:underline"
            >
              {creator.displayName}
            </Link>
            {isPending && (
              <span className="shrink-0 rounded-full bg-n-warning/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-n-warning">
                Pending
              </span>
            )}
            {isExpired && (
              <span className="shrink-0 rounded-full bg-n-error/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-n-error">
                Expired
              </span>
            )}
          </div>
          <p className="text-xs text-n-slate">/{creator.slug}</p>

          {creator.platformAccounts.length > 0 && (
            <div
              className="mt-1.5 flex flex-wrap items-center gap-1.5"
              aria-label="Connected platforms"
            >
              {sortByPlatformOrder(creator.platformAccounts).map((account) => (
                <span
                  key={account.platform}
                  title={`${PLATFORM_CONFIG[account.platform].name} — @${account.platformUsername}`}
                >
                  <PlatformIcon
                    platform={account.platform}
                    size="sm"
                    rounded="full"
                  />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Public stats — same for active/pending/expired */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-n-line pt-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-n-slate">
            Followers
          </p>
          <p className="text-sm font-bold text-n-ink">
            {formatNumber(Number(creator.totalFollowers ?? 0))}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-n-slate">
            7d Growth
          </p>
          <div className="flex items-center gap-1">
            {primaryGrowth ? (
              <>
                <span
                  className={cn(
                    "text-sm font-bold",
                    trendUp && "text-n-success",
                    trendDown && "text-n-red",
                    !trendUp && !trendDown && "text-n-slate",
                  )}
                >
                  {primaryGrowth.pct7d !== null
                    ? formatPercent(primaryGrowth.pct7d)
                    : "0.0%"}
                </span>
                {trendUp && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="3"
                  >
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                )}
                {trendDown && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#E32C19"
                    strokeWidth="3"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                )}
              </>
            ) : (
              <span className="text-sm text-n-slate">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Last synced / Expiry */}
      <div className="mt-2 space-y-0.5">
        {creator.lastSnapshotAt && (
          <p className="text-xs text-n-slate">
            Synced {formatRelativeTime(creator.lastSnapshotAt)}
          </p>
        )}
        {isPending && inviteExpiresAt && (
          <p className="text-xs text-n-warning">
            Expires {new Date(inviteExpiresAt).toLocaleDateString()}
          </p>
        )}
        {isExpired && inviteExpiresAt && (
          <p className="text-xs text-n-error">
            Expired {formatRelativeTime(inviteExpiresAt)}
          </p>
        )}
      </div>

      {/* Regenerated URL display */}
      {regeneratedUrl && (
        <div className="mt-3 rounded-lg border border-n-success/30 bg-n-success/5 p-2">
          <p className="mb-1 text-xs font-medium text-n-success">
            New link generated
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={regeneratedUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded border border-n-line bg-white px-2 py-1 text-xs text-n-ink outline-none focus:border-n-red/50"
            />
            <Button
              appearance="noticed"
              variant="ghost"
              size="sm"
              onClick={handleCopyUrl}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      {regenerateMutation.error && (
        <p role="alert" className="mt-3 text-sm text-n-error">
          {regenerateMutation.error.message}
        </p>
      )}
      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 border-t border-n-line pt-3 mt-3">
        {isActive ? (
          <Link href={profileHref} className="flex-1">
            <Button
              appearance="noticed"
              variant="secondary"
              size="sm"
              className="w-full"
            >
              Manage
            </Button>
          </Link>
        ) : (
          <Button
            appearance="noticed"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={handleRegenerate}
            disabled={regenerateMutation.isPending}
          >
            {regenerateMutation.isPending ? "…" : "Regenerate link"}
          </Button>
        )}

        {confirmingRemove ? (
          <div className="flex items-center gap-1">
            <Button
              appearance="noticed"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingRemove(false)}
              className="text-n-slate hover:text-n-ink"
            >
              Cancel
            </Button>
            <Button
              appearance="noticed"
              variant="ghost"
              size="sm"
              onClick={handleRemoveClick}
              disabled={isRemoving}
              className="text-n-error hover:bg-n-error/10 hover:text-n-error"
            >
              Confirm
            </Button>
          </div>
        ) : (
          <Button
            appearance="noticed"
            variant="ghost"
            size="sm"
            onClick={handleRemoveClick}
            disabled={isRemoving}
            className="text-n-slate hover:bg-n-error/10 hover:text-n-error"
          >
            {isActive ? "Remove" : "Cancel"}
          </Button>
        )}
      </div>
    </Card>
  );
}
