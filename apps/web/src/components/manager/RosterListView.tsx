"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { PLATFORM_CONFIG, type Platform } from "@/lib/constants/platforms";
import {
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";
import type { InviteState } from "./CreatorRosterCard";

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
  lastSnapshotAt: string | Date | null;
  growthRollups: GrowthRollup[];
};

type RosterRow = {
  accessId: string;
  inviteState: InviteState;
  inviteExpiresAt: string | Date | null;
  creator: Creator;
};

type SortField = "name" | "followers" | "growth" | "status";
type SortDirection = "asc" | "desc";

type RosterListViewProps = {
  rows: RosterRow[];
  onRemove: (creatorProfileId: string) => void;
  isRemoving: boolean;
};

const STATUS_ORDER: Record<InviteState, number> = {
  active: 0,
  pending: 1,
  expired: 2,
};

export function RosterListView({
  rows,
  onRemove,
  isRemoving,
}: RosterListViewProps) {
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regeneratedUrls, setRegeneratedUrls] = useState<
    Record<string, string>
  >({});
  const [copiedAccessId, setCopiedAccessId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const regenerateMutation = trpc.talentManager.regenerateInvite.useMutation({
    onSuccess: (data, variables) => {
      setRegeneratedUrls((prev) => ({
        ...prev,
        [variables.accessId]: data.inviteUrl,
      }));
      void utils.talentManager.getRoster.invalidate();
    },
    onSettled: () => setRegeneratingId(null),
  });

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.creator.displayName.localeCompare(b.creator.displayName);
          break;
        case "followers":
          cmp =
            Number(a.creator.totalFollowers ?? 0) -
            Number(b.creator.totalFollowers ?? 0);
          break;
        case "growth": {
          const ga =
            a.creator.growthRollups.find(
              (g) => g.platform === a.creator.primaryPlatform,
            )?.pct7d ??
            a.creator.growthRollups[0]?.pct7d ??
            -Infinity;
          const gb =
            b.creator.growthRollups.find(
              (g) => g.platform === b.creator.primaryPlatform,
            )?.pct7d ??
            b.creator.growthRollups[0]?.pct7d ??
            -Infinity;
          cmp = ga - gb;
          break;
        }
        case "status":
          cmp = STATUS_ORDER[a.inviteState] - STATUS_ORDER[b.inviteState];
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  };

  const handleRegenerate = (accessId: string) => {
    setRegeneratingId(accessId);
    regenerateMutation.mutate({ accessId });
  };

  const handleCopy = async (accessId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAccessId(accessId);
      setTimeout(() => setCopiedAccessId(null), 2000);
    } catch {
      // Clipboard may be unavailable.
    }
  };

  const handleRemove = (accessId: string, creatorProfileId: string) => {
    if (confirmingRemove === accessId) {
      onRemove(creatorProfileId);
      setConfirmingRemove(null);
    } else {
      setConfirmingRemove(accessId);
    }
  };

  const SortHeader = ({
    field,
    label,
    className,
  }: {
    field: SortField;
    label: string;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-[#949BA4] hover:text-[#DBDEE1]",
        className,
      )}
    >
      {label}
      {sortField === field && (
        <span className="text-[8px]">
          {sortDirection === "asc" ? "▲" : "▼"}
        </span>
      )}
    </button>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-[#3F4147] bg-[#1E1F22]">
      <table className="w-full">
        <thead className="border-b border-[#3F4147] bg-[#161718]">
          <tr>
            <th className="px-3 py-2.5 text-left">
              <SortHeader field="name" label="Creator" />
            </th>
            <th className="hidden px-3 py-2.5 text-left sm:table-cell">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#949BA4]">
                Platform
              </span>
            </th>
            <th className="px-3 py-2.5 text-right">
              <SortHeader
                field="followers"
                label="Followers"
                className="ml-auto"
              />
            </th>
            <th className="hidden px-3 py-2.5 text-right md:table-cell">
              <SortHeader field="growth" label="7d" className="ml-auto" />
            </th>
            <th className="px-3 py-2.5 text-left">
              <SortHeader field="status" label="Status" />
            </th>
            <th className="hidden px-3 py-2.5 text-left lg:table-cell">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#949BA4]">
                Synced
              </span>
            </th>
            <th className="px-3 py-2.5 text-right">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#949BA4]">
                Actions
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const { creator, accessId, inviteState, inviteExpiresAt } = row;
            const avatarSrc = getSafeImageSrc(creator.avatarUrl);
            const primaryGrowth =
              creator.growthRollups.find(
                (g) => g.platform === creator.primaryPlatform,
              ) ?? creator.growthRollups[0];
            const trendUp = primaryGrowth?.trendDirection === "up";
            const trendDown = primaryGrowth?.trendDirection === "down";
            const platformConfig = creator.primaryPlatform
              ? PLATFORM_CONFIG[creator.primaryPlatform]
              : null;
            const isActive = inviteState === "active";
            const profileHref = isActive
              ? `/talent-manager/creator/${creator.slug}`
              : `/creator/${creator.slug}`;
            const regeneratedUrl = regeneratedUrls[accessId];

            return (
              <tr
                key={accessId}
                className={cn(
                  "border-b border-[#3F4147] transition-colors hover:bg-[#1E1F22]/40 last:border-b-0",
                  !isActive && "bg-[#1E1F22]/30",
                )}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={profileHref}
                    className="flex items-center gap-2.5 hover:underline"
                  >
                    {avatarSrc ? (
                      <Image
                        src={avatarSrc}
                        alt={creator.displayName}
                        width={28}
                        height={28}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#383A40] text-xs font-bold text-[#F2F3F5]">
                        {creator.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#F2F3F5]">
                        {creator.displayName}
                      </p>
                      <p className="text-[10px] text-[#949BA4]">
                        /{creator.slug}
                      </p>
                    </div>
                  </Link>
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  {platformConfig ? (
                    <span className="text-xs text-[#DBDEE1]">
                      <span
                        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: platformConfig.color }}
                      />
                      {platformConfig.name}
                    </span>
                  ) : (
                    <span className="text-xs text-[#949BA4]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-medium text-[#F2F3F5]">
                  {formatNumber(Number(creator.totalFollowers ?? 0))}
                </td>
                <td className="hidden px-3 py-2.5 text-right md:table-cell">
                  {primaryGrowth?.pct7d != null ? (
                    <span
                      className={cn(
                        "text-sm font-medium",
                        trendUp && "text-[#22c55e]",
                        trendDown && "text-[#ef4444]",
                        !trendUp && !trendDown && "text-[#949BA4]",
                      )}
                    >
                      {formatPercent(primaryGrowth.pct7d)}
                    </span>
                  ) : (
                    <span className="text-sm text-[#949BA4]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {inviteState === "active" && (
                    <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#86efac]">
                      Active
                    </span>
                  )}
                  {inviteState === "pending" && (
                    <div>
                      <span className="rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#fcd34d]">
                        Pending
                      </span>
                      {inviteExpiresAt && (
                        <p className="mt-0.5 text-[10px] text-[#949BA4]">
                          exp {new Date(inviteExpiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                  {inviteState === "expired" && (
                    <span className="rounded-full bg-[#ef4444]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#fca5a5]">
                      Expired
                    </span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  {creator.lastSnapshotAt ? (
                    <span className="text-xs text-[#949BA4]">
                      {formatRelativeTime(creator.lastSnapshotAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-[#949BA4]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {isActive ? (
                      <Link href={profileHref}>
                        <Button variant="ghost" size="sm">
                          Manage
                        </Button>
                      </Link>
                    ) : regeneratedUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(accessId, regeneratedUrl)}
                      >
                        {copiedAccessId === accessId ? "Copied" : "Copy link"}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRegenerate(accessId)}
                        disabled={regeneratingId === accessId}
                      >
                        {regeneratingId === accessId ? "…" : "Regenerate"}
                      </Button>
                    )}
                    {confirmingRemove === accessId ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingRemove(null)}
                          className="text-[#949BA4]"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(accessId, creator.id)}
                          disabled={isRemoving}
                          className="text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444]"
                        >
                          Confirm
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(accessId, creator.id)}
                        disabled={isRemoving}
                        className="text-[#949BA4] hover:bg-[#ef4444]/10 hover:text-[#ef4444]"
                      >
                        {isActive ? "Remove" : "Cancel"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
