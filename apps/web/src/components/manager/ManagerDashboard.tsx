"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, Skeleton } from "@/components/ui";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CreatorRosterCard, type InviteState } from "./CreatorRosterCard";
import { RosterListView } from "./RosterListView";
import { AddCreatorModal } from "./AddCreatorModal";
import { ExportRosterButton } from "./ExportRosterButton";
import { formatNumber, formatPercent } from "@/lib/utils/format";

type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "manager-roster-view";

type ManagerDashboardProps = {
  userId: string;
};

export function ManagerDashboard({ userId: _userId }: ManagerDashboardProps) {
  void _userId; // reserved for future per-user preferences
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const utils = trpc.useUtils();

  const { data: roster, isLoading } = trpc.talentManager.getRoster.useQuery();

  const removeMutation = trpc.talentManager.removeCreator.useMutation({
    onSuccess: async () => {
      await utils.talentManager.getRoster.invalidate();
    },
  });

  // Persist view preference per browser.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "list") setView(stored);
  }, []);

  const handleViewChange = (next: ViewMode) => {
    setView(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    }
  };

  const stats = useMemo(() => {
    if (!roster || roster.length === 0) {
      return {
        activeCount: 0,
        pendingCount: 0,
        totalFollowers: 0,
        avgGrowth: 0,
      };
    }

    // Only ACTIVE rows count toward managed-creator stats. Pending invites
    // grant no access yet and must not skew followers/growth.
    let totalFollowers = 0;
    let growthSum = 0;
    let growthCount = 0;
    let activeCount = 0;
    let pendingCount = 0;

    for (const item of roster) {
      if (item.inviteState === "active") {
        activeCount += 1;
        totalFollowers += Number(item.creator.totalFollowers ?? 0);
        for (const rollup of item.creator.growthRollups) {
          if (rollup.pct7d !== null && rollup.pct7d !== undefined) {
            growthSum += rollup.pct7d;
            growthCount += 1;
          }
        }
      } else {
        // pending OR expired — both count as "not yet managed"
        pendingCount += 1;
      }
    }

    return {
      activeCount,
      pendingCount,
      totalFollowers,
      avgGrowth: growthCount > 0 ? growthSum / growthCount : 0,
    };
  }, [roster]);

  const handleRemove = (creatorProfileId: string) => {
    removeMutation.mutate({ creatorProfileId });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const rosterRows = (roster ?? []).map((item) => ({
    accessId: item.accessId,
    inviteState: item.inviteState as InviteState,
    inviteExpiresAt: item.inviteExpiresAt,
    creator: item.creator,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F2F3F5]">Your Roster</h1>
          <p className="mt-1 text-sm text-[#949BA4]">
            Manage your creator partnerships and track their performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-[#3F4147] bg-[#1E1F22] p-0.5">
            <button
              type="button"
              onClick={() => handleViewChange("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                view === "grid"
                  ? "bg-[#313338] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:text-[#DBDEE1]",
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleViewChange("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                view === "list"
                  ? "bg-[#313338] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:text-[#DBDEE1]",
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
          <ExportRosterButton disabled={(roster?.length ?? 0) === 0} />
          <Button onClick={() => setAddModalOpen(true)}>Invite Creator</Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Active Creators
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {stats.activeCount}
            {stats.pendingCount > 0 && (
              <span className="ml-1 text-sm font-medium text-[#949BA4]">
                (+{stats.pendingCount} pending)
              </span>
            )}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Combined Followers
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {formatNumber(stats.totalFollowers)}
          </p>
          <p className="text-[10px] text-[#949BA4]">active roster only</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Avg. Growth (7d)
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {formatPercent(stats.avgGrowth)}
          </p>
          <p className="text-[10px] text-[#949BA4]">active roster only</p>
        </Card>
      </div>

      {/* Roster */}
      {rosterRows.length > 0 ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rosterRows.map((row) => (
              <CreatorRosterCard
                key={row.accessId}
                accessId={row.accessId}
                creator={row.creator}
                inviteState={row.inviteState}
                grantedAt={new Date()}
                inviteExpiresAt={row.inviteExpiresAt}
                onRemove={() => handleRemove(row.creator.id)}
                isRemoving={removeMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <RosterListView
            rows={rosterRows}
            onRemove={handleRemove}
            isRemoving={removeMutation.isPending}
          />
        )
      ) : (
        <Card className="py-12 text-center">
          <div className="mb-3 text-[#949BA4]">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#DBDEE1]">
            No creators in your roster yet
          </p>
          <p className="mt-1 text-xs text-[#949BA4]">
            Invite creators to manage their profiles. They&apos;ll need to
            accept the invitation before you gain analytics access.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => setAddModalOpen(true)}
          >
            Invite Creator
          </Button>
        </Card>
      )}

      <AddCreatorModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </div>
  );
}
