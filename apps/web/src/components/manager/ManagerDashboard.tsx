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

  const {
    data: roster,
    isLoading,
    isError,
    refetch,
  } = trpc.talentManager.getRoster.useQuery();

  const removeMutation = trpc.talentManager.removeCreator.useMutation({
    onSuccess: async () => {
      await utils.talentManager.getRoster.invalidate();
    },
  });

  // Persist view preference per browser.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      /* A blocked preference store must not block the roster. */
    }
  }, []);

  const handleViewChange = (next: ViewMode) => {
    setView(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(VIEW_STORAGE_KEY, next);
      } catch {
        /* The view still changes for this visit. */
      }
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
      <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="mb-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
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
    <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:px-10">
      {/* Header */}
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-n-ink">
            Your roster
          </h1>
          <p className="mt-1 text-sm text-n-slate">
            Your creators, their performance and the invitations that connect
            you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-n-line bg-white p-0.5">
            <button
              type="button"
              onClick={() => handleViewChange("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-md transition-colors",
                view === "grid"
                  ? "bg-n-ink text-white"
                  : "text-n-slate hover:text-n-ink",
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
                "flex h-11 w-11 items-center justify-center rounded-md transition-colors",
                view === "list"
                  ? "bg-n-ink text-white"
                  : "text-n-slate hover:text-n-ink",
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
          <ExportRosterButton disabled={stats.activeCount === 0} />
          <Button appearance="noticed" onClick={() => setAddModalOpen(true)}>
            Invite Creator
          </Button>
        </div>
      </div>

      {isError && (
        <div
          role="alert"
          className="mb-8 border-l-2 border-n-error bg-n-error/5 p-5 text-sm"
        >
          We couldn’t load your roster.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => refetch()}
          >
            Try again
          </button>
        </div>
      )}
      {removeMutation.error && (
        <p role="alert" className="mb-6 text-sm text-n-error">
          {removeMutation.error.message}
        </p>
      )}
      {/* Stats Row */}
      <div className="mb-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div className="border-t border-n-line py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-n-slate">
            Active Creators
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-n-ink">
            {stats.activeCount}
            {stats.pendingCount > 0 && (
              <span className="ml-1 text-sm font-medium text-n-slate">
                ({stats.pendingCount} awaiting acceptance)
              </span>
            )}
          </p>
        </div>
        <div className="border-t border-n-line py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-n-slate">
            Combined Followers
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-n-ink">
            {formatNumber(stats.totalFollowers)}
          </p>
          <p className="text-xs text-n-slate">active roster only</p>
        </div>
        <div className="border-t border-n-line py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-n-slate">
            Avg. Growth (7d)
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-n-ink">
            {formatPercent(stats.avgGrowth)}
          </p>
          <p className="text-xs text-n-slate">active roster only</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-n-line pb-4">
        <h2 className="text-xl font-bold">Creators & invitations</h2>
        <p className="text-sm text-n-slate">
          Only accepted invitations grant access to a creator’s shared data.
        </p>
      </div>
      {/* Roster */}
      {isError ? null : rosterRows.length > 0 ? (
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
        <Card appearance="noticed" className="py-12 text-center">
          <div className="mb-3 text-n-slate">
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
          <p className="text-sm font-medium text-n-ink">
            No creators in your roster yet
          </p>
          <p className="mt-1 text-xs text-n-slate">
            Invite creators to manage their profiles. They&apos;ll need to
            accept the invitation before you gain analytics access.
          </p>
          <Button
            appearance="noticed"
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
