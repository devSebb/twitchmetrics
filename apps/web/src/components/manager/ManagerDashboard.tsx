"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, Skeleton } from "@/components/ui";
import { Button } from "@/components/ui";
import { CreatorRosterCard } from "./CreatorRosterCard";
import { AddCreatorModal } from "./AddCreatorModal";
import { formatNumber, formatPercent } from "@/lib/utils/format";

type ManagerDashboardProps = {
  userId: string;
};

export function ManagerDashboard({ userId }: ManagerDashboardProps) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: roster, isLoading } = trpc.talentManager.getRoster.useQuery();

  const removeMutation = trpc.talentManager.removeCreator.useMutation({
    onSuccess: async () => {
      await utils.talentManager.getRoster.invalidate();
    },
  });

  const stats = useMemo(() => {
    if (!roster || roster.length === 0) {
      return { totalCreators: 0, totalFollowers: 0, avgGrowth: 0 };
    }

    let totalFollowers = 0;
    let growthSum = 0;
    let growthCount = 0;

    for (const item of roster) {
      totalFollowers += Number(item.creator.totalFollowers ?? 0);
      for (const rollup of item.creator.growthRollups) {
        if (rollup.pct7d !== null && rollup.pct7d !== undefined) {
          growthSum += rollup.pct7d;
          growthCount += 1;
        }
      }
    }

    return {
      totalCreators: roster.length,
      totalFollowers,
      avgGrowth: growthCount > 0 ? growthSum / growthCount : 0,
    };
  }, [roster]);

  const handleRemove = (creatorProfileId: string) => {
    const confirmed = window.confirm(
      "Remove this creator from your roster? This action can be undone by re-adding them later.",
    );
    if (!confirmed) return;
    removeMutation.mutate({ creatorProfileId });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F2F3F5]">Your Roster</h1>
          <p className="mt-1 text-sm text-[#949BA4]">
            Manage your creator partnerships and track their performance.
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}>Add Creator</Button>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Managed Creators
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {stats.totalCreators}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Combined Followers
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {formatNumber(stats.totalFollowers)}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Avg. Growth (7d)
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {formatPercent(stats.avgGrowth)}
          </p>
        </Card>
      </div>

      {/* Creator Grid */}
      {roster && roster.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((item) => (
            <CreatorRosterCard
              key={item.accessId}
              creator={item.creator}
              permissions={item.permissions}
              grantedAt={item.grantedAt}
              onRemove={() => handleRemove(item.creator.id)}
              isRemoving={removeMutation.isPending}
            />
          ))}
        </div>
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
            Add creators to start managing their profiles and tracking
            performance.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => setAddModalOpen(true)}
          >
            Add Creator
          </Button>
        </Card>
      )}

      {/* Add Creator Modal */}
      <AddCreatorModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </div>
  );
}
