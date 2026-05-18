"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, Badge, Button } from "@/components/ui";
import { PLATFORM_CONFIG, type Platform } from "@/lib/constants/platforms";
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

  const trendUp = primaryGrowth?.trendDirection === "up";
  const trendDown = primaryGrowth?.trendDirection === "down";

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
      className={cn(
        "flex flex-col transition-colors",
        isActive && "hover:border-[#4E5058]",
        isPending && "border-dashed border-[#3F4147] bg-[#1E1F22]/60",
        isExpired &&
          "border-dashed border-[#3F4147] bg-[#1E1F22]/40 opacity-90",
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#383A40] text-lg font-bold text-[#F2F3F5]">
              {creator.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={profileHref}
              className="truncate text-sm font-semibold text-[#F2F3F5] hover:underline"
            >
              {creator.displayName}
            </Link>
            {isPending && (
              <span className="shrink-0 rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#fcd34d]">
                Pending
              </span>
            )}
            {isExpired && (
              <span className="shrink-0 rounded-full bg-[#ef4444]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#fca5a5]">
                Expired
              </span>
            )}
          </div>
          <p className="text-xs text-[#949BA4]">/{creator.slug}</p>

          {creator.primaryPlatform && (
            <Badge
              variant="platform"
              platform={creator.primaryPlatform}
              className="mt-1"
            >
              {PLATFORM_CONFIG[creator.primaryPlatform].name}
            </Badge>
          )}
        </div>
      </div>

      {/* Public stats — same for active/pending/expired */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#3F4147] pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#949BA4]">
            Followers
          </p>
          <p className="text-sm font-bold text-[#F2F3F5]">
            {formatNumber(Number(creator.totalFollowers ?? 0))}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#949BA4]">
            7d Growth
          </p>
          <div className="flex items-center gap-1">
            {primaryGrowth ? (
              <>
                <span
                  className={cn(
                    "text-sm font-bold",
                    trendUp && "text-[#22c55e]",
                    trendDown && "text-[#ef4444]",
                    !trendUp && !trendDown && "text-[#949BA4]",
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
                    stroke="#ef4444"
                    strokeWidth="3"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                )}
              </>
            ) : (
              <span className="text-sm text-[#949BA4]">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Last synced / Expiry */}
      <div className="mt-2 space-y-0.5">
        {creator.lastSnapshotAt && (
          <p className="text-[10px] text-[#949BA4]">
            Synced {formatRelativeTime(creator.lastSnapshotAt)}
          </p>
        )}
        {isPending && inviteExpiresAt && (
          <p className="text-[10px] text-[#fcd34d]">
            Expires {new Date(inviteExpiresAt).toLocaleDateString()}
          </p>
        )}
        {isExpired && inviteExpiresAt && (
          <p className="text-[10px] text-[#fca5a5]">
            Expired {formatRelativeTime(inviteExpiresAt)}
          </p>
        )}
      </div>

      {/* Regenerated URL display */}
      {regeneratedUrl && (
        <div className="mt-3 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/5 p-2">
          <p className="mb-1 text-[10px] font-medium text-[#86efac]">
            New link generated
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={regeneratedUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded border border-[#3F4147] bg-[#1E1F22] px-2 py-1 text-[10px] text-[#DBDEE1] outline-none focus:border-[#E32C19]/50"
            />
            <Button variant="ghost" size="sm" onClick={handleCopyUrl}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 border-t border-[#3F4147] pt-3 mt-3">
        {isActive ? (
          <Link href={profileHref} className="flex-1">
            <Button variant="secondary" size="sm" className="w-full">
              Manage
            </Button>
          </Link>
        ) : (
          <Button
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
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingRemove(false)}
              className="text-[#949BA4] hover:text-[#DBDEE1]"
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveClick}
              disabled={isRemoving}
              className="text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444]"
            >
              Confirm
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveClick}
            disabled={isRemoving}
            className="text-[#949BA4] hover:bg-[#ef4444]/10 hover:text-[#ef4444]"
          >
            {isActive ? "Remove" : "Cancel"}
          </Button>
        )}
      </div>
    </Card>
  );
}
