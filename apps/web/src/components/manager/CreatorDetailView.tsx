"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, Badge, Skeleton } from "@/components/ui";
import {
  PLATFORM_CONFIG,
  sortByPlatformOrder,
  type Platform,
} from "@/lib/constants/platforms";
import {
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from "@/lib/utils/format";
import { PlatformIcon } from "@/components/shared";
import { getSafeImageSrc } from "@/lib/safeImage";

type PlatformAccount = {
  platform: Platform;
  platformUsername: string;
  followerCount: string;
};

type GrowthRollup = {
  platform: Platform;
  delta7d: string;
  pct7d: number | null;
  trendDirection: string | null;
};

type Permissions = {
  canViewAnalytics: boolean;
  canEditProfile: boolean;
  canExportData: boolean;
  canManageBrands: boolean;
};

type CreatorData = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  primaryPlatform: Platform | null;
  totalFollowers: string;
  totalViews: string;
  state: string;
  lastSnapshotAt: string | null;
  platformAccounts: PlatformAccount[];
  growthRollups: GrowthRollup[];
};

type CreatorDetailViewProps = {
  creator: CreatorData;
  permissions: Permissions;
  grantedAt: string;
};

const PERMISSION_LABELS: { key: keyof Permissions; label: string }[] = [
  { key: "canViewAnalytics", label: "View Analytics" },
  { key: "canEditProfile", label: "Edit Profile" },
  { key: "canExportData", label: "Export Data" },
  { key: "canManageBrands", label: "Manage Brands" },
];

function AnalyticsSection({ creatorProfileId }: { creatorProfileId: string }) {
  const [period, setPeriod] = useState(30);
  const { data, isLoading, isError, refetch } =
    trpc.talentManager.getCreatorAnalytics.useQuery({
      creatorProfileId,
      periodDays: period,
    });

  return (
    <Card appearance="noticed">
      <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
        <h3 className="text-sm font-semibold text-n-ink">Creator Analytics</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={period === d}
              onClick={() => setPeriod(d)}
              className={`rounded-md px-2 py-1 text-xs ${
                period === d
                  ? "bg-n-red text-white"
                  : "bg-n-surface text-n-slate hover:text-n-ink"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="py-6 text-sm text-n-error">
          Analytics could not load.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Try again
          </button>
        </p>
      ) : !data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-n-slate">
          No analytics data available for this period. Enrichment data is
          collected for creators with connected OAuth accounts.
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((entry, i) => {
            const config = PLATFORM_CONFIG[entry.platform as Platform] ?? null;
            return (
              <div
                key={i}
                className="rounded-lg border border-n-line bg-n-surface p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  {config && (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: config.color }}
                    />
                  )}
                  <span className="text-xs font-medium text-n-ink">
                    {config?.name ?? entry.platform}
                  </span>
                  <span className="ml-auto text-xs text-n-slate">
                    {new Date(entry.periodStart).toLocaleDateString()} –{" "}
                    {new Date(entry.periodEnd).toLocaleDateString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {entry.views != null && (
                    <div>
                      <p className="text-xs uppercase text-n-slate">Views</p>
                      <p className="text-sm font-bold text-n-ink">
                        {formatNumber(Number(entry.views))}
                      </p>
                    </div>
                  )}
                  {entry.impressions != null && (
                    <div>
                      <p className="text-xs uppercase text-n-slate">
                        Impressions
                      </p>
                      <p className="text-sm font-bold text-n-ink">
                        {formatNumber(Number(entry.impressions))}
                      </p>
                    </div>
                  )}
                  {entry.subscribersGained != null && (
                    <div>
                      <p className="text-xs uppercase text-n-slate">
                        Subs Gained
                      </p>
                      <p className="text-sm font-bold text-n-success">
                        +{formatNumber(entry.subscribersGained)}
                      </p>
                    </div>
                  )}
                  {entry.estimatedMinutesWatched != null && (
                    <div>
                      <p className="text-xs uppercase text-n-slate">
                        Watch Time
                      </p>
                      <p className="text-sm font-bold text-n-ink">
                        {formatNumber(Number(entry.estimatedMinutesWatched))}{" "}
                        min
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function CreatorDetailView({
  creator,
  permissions,
  grantedAt,
}: CreatorDetailViewProps) {
  const avatarSrc = getSafeImageSrc(creator.avatarUrl);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/roster"
        className="inline-flex items-center gap-1 text-sm text-n-slate hover:text-n-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Roster
      </Link>

      {/* Profile header */}
      <Card appearance="noticed">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {avatarSrc ? (
            <Image
              src={avatarSrc}
              alt={creator.displayName}
              width={80}
              height={80}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-n-surface text-2xl font-bold text-n-ink">
              {creator.displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-n-ink">
              {creator.displayName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-n-slate">/{creator.slug}</span>
              <Badge
                className={`text-xs ${
                  creator.state === "claimed" || creator.state === "premium"
                    ? "bg-n-success/10 text-n-success"
                    : "bg-n-surface text-n-slate"
                }`}
              >
                {creator.state}
              </Badge>
            </div>
            <div className="mt-2 text-xs text-n-slate">
              Managed since {new Date(grantedAt).toLocaleDateString()}
              {creator.lastSnapshotAt && (
                <> · Last synced {formatRelativeTime(creator.lastSnapshotAt)}</>
              )}
            </div>
          </div>

          <Link
            href={`/creator/${creator.slug}`}
            className="n-button n-button-secondary"
          >
            View public profile ↗
          </Link>
        </div>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="min-w-0 border-t border-n-line py-5">
          <p className="text-xs uppercase tracking-wider text-n-slate">
            Total Followers
          </p>
          <p className="mt-1 text-3xl font-bold text-n-ink">
            {formatNumber(Number(creator.totalFollowers))}
          </p>
        </div>
        <div className="min-w-0 border-t border-n-line py-5">
          <p className="text-xs uppercase tracking-wider text-n-slate">
            Total Views
          </p>
          <p className="mt-1 text-3xl font-bold text-n-ink">
            {formatNumber(Number(creator.totalViews))}
          </p>
        </div>
        <div className="min-w-0 border-t border-n-line py-5">
          <p className="text-xs uppercase tracking-wider text-n-slate">
            Platforms
          </p>
          <p className="mt-1 text-3xl font-bold text-n-ink">
            {creator.platformAccounts.length}
          </p>
        </div>
        <div className="min-w-0 border-t border-n-line py-5">
          <p className="text-xs uppercase tracking-wider text-n-slate">
            Primary
          </p>
          <p className="mt-1 text-3xl font-bold text-n-ink">
            {creator.primaryPlatform
              ? PLATFORM_CONFIG[creator.primaryPlatform].name
              : "—"}
          </p>
        </div>
      </div>

      {/* Platform breakdown */}
      <Card appearance="noticed">
        <h3 className="mb-3 text-sm font-semibold text-n-ink">
          Platform Breakdown
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortByPlatformOrder(creator.platformAccounts).map((account) => {
            const config = PLATFORM_CONFIG[account.platform];
            const growth = creator.growthRollups.find(
              (g) => g.platform === account.platform,
            );

            return (
              <div
                key={account.platform}
                className="flex items-center gap-3 rounded-lg border border-n-line bg-n-surface p-3"
              >
                <PlatformIcon platform={account.platform} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-n-ink">
                      {config.name}
                    </span>
                    <span className="text-xs text-n-slate">
                      @{account.platformUsername}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-n-ink">
                      {formatNumber(Number(account.followerCount))}
                    </span>
                    {growth && growth.pct7d !== null && (
                      <span
                        className={`text-xs font-medium ${
                          growth.pct7d > 0
                            ? "text-n-success"
                            : growth.pct7d < 0
                              ? "text-n-red"
                              : "text-n-slate"
                        }`}
                      >
                        {formatPercent(growth.pct7d)} 7d
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Permissions */}
      <Card appearance="noticed">
        <h3 className="mb-3 text-sm font-semibold text-n-ink">
          Your Permissions
        </h3>
        <div className="flex flex-wrap gap-2">
          {PERMISSION_LABELS.map((perm) => (
            <Badge
              key={perm.key}
              className={
                permissions[perm.key]
                  ? "bg-n-success/10 text-n-success"
                  : "bg-n-surface text-n-slate"
              }
            >
              {perm.label}: {permissions[perm.key] ? "Allowed" : "Not granted"}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Analytics (if permitted) */}
      {permissions.canViewAnalytics && (
        <AnalyticsSection creatorProfileId={creator.id} />
      )}

      {!permissions.canViewAnalytics && (
        <Card appearance="noticed" className="py-8 text-center">
          <p className="text-sm text-n-slate">
            You don&apos;t have permission to view analytics for this creator.
          </p>
        </Card>
      )}
    </div>
  );
}
