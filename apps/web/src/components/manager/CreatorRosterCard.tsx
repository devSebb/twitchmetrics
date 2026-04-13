"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

type CreatorRosterCardProps = {
  creator: Creator;
  grantedAt: string | Date;
  onRemove: () => void;
  isRemoving: boolean;
};

export function CreatorRosterCard({
  creator,
  grantedAt,
  onRemove,
  isRemoving,
}: CreatorRosterCardProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const avatarSrc = getSafeImageSrc(creator.avatarUrl);
  const primaryGrowth =
    creator.growthRollups.find((g) => g.platform === creator.primaryPlatform) ??
    creator.growthRollups[0];

  // DB stores lowercase "up"/"down"/"flat"
  const trendUp = primaryGrowth?.trendDirection === "up";
  const trendDown = primaryGrowth?.trendDirection === "down";

  const handleRemoveClick = () => {
    if (confirmingRemove) {
      onRemove();
      setConfirmingRemove(false);
    } else {
      setConfirmingRemove(true);
    }
  };

  return (
    <Card className="flex flex-col transition-colors hover:border-[#4E5058]">
      <div className="flex items-start gap-3">
        {/* Avatar */}
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

        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-[#F2F3F5]">
            {creator.displayName}
          </h3>
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

      {/* Stats */}
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

      {/* Last synced */}
      {creator.lastSnapshotAt && (
        <p className="mt-2 text-[10px] text-[#949BA4]">
          Synced {formatRelativeTime(creator.lastSnapshotAt)}
        </p>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 border-t border-[#3F4147] pt-3 mt-3">
        <Link href={`/creator/${creator.slug}`} className="flex-1">
          <Button variant="secondary" size="sm" className="w-full">
            View Profile
          </Button>
        </Link>

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
            Remove
          </Button>
        )}
      </div>
    </Card>
  );
}
