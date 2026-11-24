"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
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
import type { InviteState } from "./CreatorRosterCard";

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
  lastSnapshotAt: string | Date | null;
  growthRollups: GrowthRollup[];
  platformAccounts: PlatformAccount[];
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
        "flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-n-slate hover:text-n-ink",
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
    <div>
      {regenerateMutation.error && (
        <p role="alert" className="mb-4 text-sm text-n-error">
          {regenerateMutation.error.message}
        </p>
      )}
      <div
        role="region"
        aria-label="Creator roster table, scroll horizontally for all columns"
        tabIndex={0}
        className="overflow-x-auto border-y border-n-line bg-white"
      >
        <table className="w-full min-w-[960px]">
          <caption className="sr-only">
            Creators and invitations. Select a column heading to sort.
          </caption>
          <thead className="border-b border-n-line bg-white">
            <tr>
              <th
                scope="col"
                aria-sort={
                  sortField === "name"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="px-3 py-2.5 text-left"
              >
                <SortHeader field="name" label="Creator" />
              </th>
              <th scope="col" className="px-3 py-2.5 text-left">
                <span className="text-xs font-medium uppercase tracking-wider text-n-slate">
                  Platforms
                </span>
              </th>
              <th
                scope="col"
                aria-sort={
                  sortField === "followers"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="px-3 py-2.5 text-right"
              >
                <SortHeader
                  field="followers"
                  label="Followers"
                  className="ml-auto"
                />
              </th>
              <th
                scope="col"
                aria-sort={
                  sortField === "growth"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="px-3 py-2.5 text-right"
              >
                <SortHeader field="growth" label="7d" className="ml-auto" />
              </th>
              <th
                scope="col"
                aria-sort={
                  sortField === "status"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="px-3 py-2.5 text-left"
              >
                <SortHeader field="status" label="Status" />
              </th>
              <th scope="col" className="px-3 py-2.5 text-left">
                <span className="text-xs font-medium uppercase tracking-wider text-n-slate">
                  Synced
                </span>
              </th>
              <th scope="col" className="px-3 py-2.5 text-right">
                <span className="text-xs font-medium uppercase tracking-wider text-n-slate">
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
              // Color from the actual value so a loss never renders green.
              const trendUp =
                primaryGrowth?.pct7d != null && primaryGrowth.pct7d > 0;
              const trendDown =
                primaryGrowth?.pct7d != null && primaryGrowth.pct7d < 0;
              const sortedPlatforms = sortByPlatformOrder(
                creator.platformAccounts,
              );
              const isActive = inviteState === "active";
              const profileHref = isActive
                ? `/talent-manager/creator/${creator.slug}`
                : `/creator/${creator.slug}`;
              const regeneratedUrl = regeneratedUrls[accessId];

              return (
                <tr
                  key={accessId}
                  className={cn(
                    "border-b border-n-line transition-colors hover:bg-n-surface/50 last:border-b-0",
                    !isActive && "bg-white/30",
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
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-n-surface text-xs font-bold text-n-ink">
                          {creator.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-n-ink">
                          {creator.displayName}
                        </p>
                        <p className="text-xs text-n-slate">/{creator.slug}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {sortedPlatforms.length > 0 ? (
                      <div
                        className="flex flex-wrap items-center gap-1.5"
                        aria-label="Connected platforms"
                      >
                        {sortedPlatforms.map((account) => (
                          <span
                            key={account.platform}
                            title={`${PLATFORM_CONFIG[account.platform].name} — @${account.platformUsername}`}
                          >
                            <PlatformIcon
                              platform={account.platform}
                              size="xs"
                              rounded="full"
                            />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-n-slate">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-medium text-n-ink">
                    {formatNumber(Number(creator.totalFollowers ?? 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {primaryGrowth?.pct7d != null ? (
                      <span
                        className={cn(
                          "text-sm font-medium",
                          trendUp && "text-n-success",
                          trendDown && "text-n-red",
                          !trendUp && !trendDown && "text-n-slate",
                        )}
                      >
                        {formatPercent(primaryGrowth.pct7d)}
                      </span>
                    ) : (
                      <span className="text-sm text-n-slate">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {inviteState === "active" && (
                      <span className="rounded-full bg-n-success/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-n-success">
                        Active
                      </span>
                    )}
                    {inviteState === "pending" && (
                      <div>
                        <span className="rounded-full bg-n-warning/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-n-warning">
                          Pending
                        </span>
                        {inviteExpiresAt && (
                          <p className="mt-0.5 text-xs text-n-slate">
                            exp {new Date(inviteExpiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                    {inviteState === "expired" && (
                      <span className="rounded-full bg-n-error/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-n-error">
                        Expired
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {creator.lastSnapshotAt ? (
                      <span className="text-xs text-n-slate">
                        {formatRelativeTime(creator.lastSnapshotAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-n-slate">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isActive ? (
                        <Link href={profileHref}>
                          <Button
                            appearance="noticed"
                            variant="ghost"
                            size="sm"
                          >
                            Manage
                          </Button>
                        </Link>
                      ) : regeneratedUrl ? (
                        <Button
                          appearance="noticed"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(accessId, regeneratedUrl)}
                        >
                          {copiedAccessId === accessId ? "Copied" : "Copy link"}
                        </Button>
                      ) : (
                        <Button
                          appearance="noticed"
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
                            appearance="noticed"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmingRemove(null)}
                            className="text-n-slate"
                          >
                            Cancel
                          </Button>
                          <Button
                            appearance="noticed"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(accessId, creator.id)}
                            disabled={isRemoving}
                            className="text-n-error hover:bg-n-error/10 hover:text-n-error"
                          >
                            Confirm
                          </Button>
                        </>
                      ) : (
                        <Button
                          appearance="noticed"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(accessId, creator.id)}
                          disabled={isRemoving}
                          className="text-n-slate hover:bg-n-error/10 hover:text-n-error"
                        >
                          {isActive ? "Remove" : "Cancel"}
                        </Button>
                      )}
                    </div>
                    {regeneratedUrl && (
                      <input
                        aria-label={`Invitation link for ${creator.displayName}`}
                        readOnly
                        value={regeneratedUrl}
                        onFocus={(event) => event.target.select()}
                        className="n-input mt-2 max-w-64 text-xs"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
