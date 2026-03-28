"use client";

import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils/format";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
    />
  );
}

function HealthCard({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
      <div className="flex items-center gap-2">
        <StatusDot ok={ok} />
        <p className="font-semibold text-[#F2F3F5]">{label}</p>
      </div>
      {detail && <p className="mt-1 text-xs text-[#949BA4]">{detail}</p>}
      <p
        className={`mt-2 text-sm font-medium ${ok ? "text-[#22c55e]" : "text-[#ef4444]"}`}
      >
        {ok ? "Healthy" : "Degraded"}
      </p>
    </div>
  );
}

function FreshnessCard({
  tier,
  lastAt,
  stale,
}: {
  tier: string;
  lastAt: string | null;
  stale: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
      <div className="flex items-center gap-2">
        <StatusDot ok={!stale} />
        <p className="font-semibold capitalize text-[#F2F3F5]">
          {tier} Snapshots
        </p>
      </div>
      <p className="mt-1 text-xs text-[#949BA4]">
        Last: {lastAt ? formatRelativeTime(new Date(lastAt)) : "Never"}
      </p>
      <p
        className={`mt-2 text-sm font-medium ${stale ? "text-[#ef4444]" : "text-[#22c55e]"}`}
      >
        {stale ? "Stale" : "Fresh"}
      </p>
    </div>
  );
}

export function SystemHealth() {
  const { data, isLoading, refetch } = trpc.admin.getSystemHealth.useQuery(
    undefined,
    {
      refetchInterval: 60 * 1000,
    },
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#949BA4]">
          Auto-refreshes every 60 seconds.
        </p>
        <button
          type="button"
          onClick={() => {
            void refetch();
          }}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-1.5 text-xs text-[#DBDEE1] hover:bg-[#4E5058]"
        >
          Refresh Now
        </button>
      </div>

      {/* Infrastructure */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#949BA4]">
          Infrastructure
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HealthCard
            label="Database"
            ok={data?.db.ok ?? false}
            detail="PostgreSQL"
          />
        </div>
      </div>

      {/* Snapshot pipeline */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#949BA4]">
          Snapshot Pipeline
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FreshnessCard
            tier="tier1"
            lastAt={data?.snapshotFreshness.tier1.lastAt ?? null}
            stale={data?.snapshotFreshness.tier1.stale ?? true}
          />
          <FreshnessCard
            tier="tier2"
            lastAt={data?.snapshotFreshness.tier2.lastAt ?? null}
            stale={data?.snapshotFreshness.tier2.stale ?? true}
          />
          <FreshnessCard
            tier="tier3"
            lastAt={data?.snapshotFreshness.tier3.lastAt ?? null}
            stale={data?.snapshotFreshness.tier3.stale ?? true}
          />
          <FreshnessCard
            tier="games"
            lastAt={data?.gameFreshness.lastSnapshotAt ?? null}
            stale={data?.gameFreshness.stale ?? true}
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
          <p className="text-xs text-[#949BA4]">Stale Creators (&gt;24h)</p>
          <p
            className={`mt-1 text-2xl font-bold ${(data?.staleCreators ?? 0) > 0 ? "text-[#f59e0b]" : "text-[#22c55e]"}`}
          >
            {data?.staleCreators ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
          <p className="text-xs text-[#949BA4]">Oldest Pending Claim</p>
          <p className="mt-1 text-sm font-semibold text-[#F2F3F5]">
            {data?.oldestPendingClaim
              ? formatRelativeTime(new Date(data.oldestPendingClaim))
              : "None"}
          </p>
        </div>
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
          <p className="text-xs text-[#949BA4]">Games Snapshotted (24h)</p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {data?.gameFreshness.gamesSnapshotted24h ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
          <p className="text-xs text-[#949BA4]">Games Missing Snapshots</p>
          <p
            className={`mt-1 text-2xl font-bold ${(data?.gameFreshness.gamesMissingSnapshots ?? 0) > 0 ? "text-[#f59e0b]" : "text-[#22c55e]"}`}
          >
            {data?.gameFreshness.gamesMissingSnapshots ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
          <p className="text-xs text-[#949BA4]">Games Missing Enrichment</p>
          <p
            className={`mt-1 text-2xl font-bold ${(data?.gameFreshness.gamesMissingEnrichment ?? 0) > 0 ? "text-[#f59e0b]" : "text-[#22c55e]"}`}
          >
            {data?.gameFreshness.gamesMissingEnrichment ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
}
