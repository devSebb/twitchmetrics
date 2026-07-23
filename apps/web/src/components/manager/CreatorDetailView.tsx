"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, Badge, Button, Skeleton } from "@/components/ui";
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
  const { data, isLoading } = trpc.talentManager.getCreatorAnalytics.useQuery({
    creatorProfileId,
    periodDays: period,
  });

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#F2F3F5]">
          Creator Analytics
        </h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriod(d)}
              className={`rounded-md px-2 py-1 text-xs ${
                period === d
                  ? "bg-[#E32C19] text-white"
                  : "bg-[#383A40] text-[#949BA4] hover:text-[#DBDEE1]"
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
      ) : !data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#949BA4]">
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
                className="rounded-lg border border-[#3F4147] bg-[#2B2D31] p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  {config && (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: config.color }}
                    />
                  )}
                  <span className="text-xs font-medium text-[#DBDEE1]">
                    {config?.name ?? entry.platform}
                  </span>
                  <span className="ml-auto text-[10px] text-[#949BA4]">
                    {new Date(entry.periodStart).toLocaleDateString()} –{" "}
                    {new Date(entry.periodEnd).toLocaleDateString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {entry.views != null && (
                    <div>
                      <p className="text-[10px] uppercase text-[#949BA4]">
                        Views
                      </p>
                      <p className="text-sm font-bold text-[#F2F3F5]">
                        {formatNumber(Number(entry.views))}
                      </p>
                    </div>
                  )}
                  {entry.impressions != null && (
                    <div>
                      <p className="text-[10px] uppercase text-[#949BA4]">
                        Impressions
                      </p>
                      <p className="text-sm font-bold text-[#F2F3F5]">
                        {formatNumber(Number(entry.impressions))}
                      </p>
                    </div>
                  )}
                  {entry.subscribersGained != null && (
                    <div>
                      <p className="text-[10px] uppercase text-[#949BA4]">
                        Subs Gained
                      </p>
                      <p className="text-sm font-bold text-[#22c55e]">
                        +{formatNumber(entry.subscribersGained)}
                      </p>
                    </div>
                  )}
                  {entry.estimatedMinutesWatched != null && (
                    <div>
                      <p className="text-[10px] uppercase text-[#949BA4]">
                        Watch Time
                      </p>
                      <p className="text-sm font-bold text-[#F2F3F5]">
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
        className="inline-flex items-center gap-1 text-sm text-[#949BA4] hover:text-[#DBDEE1]"
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
      <Card>
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
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#383A40] text-2xl font-bold text-[#F2F3F5]">
              {creator.displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1">
            <h2 className="text-2xl font-bold text-[#F2F3F5]">
              {creator.displayName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-[#949BA4]">/{creator.slug}</span>
              <Badge
                className={`text-[10px] ${
                  creator.state === "claimed" || creator.state === "premium"
                    ? "bg-[#22c55e]/10 text-[#22c55e]"
                    : "bg-[#383A40] text-[#949BA4]"
                }`}
              >
                {creator.state}
              </Badge>
            </div>
            <div className="mt-2 text-xs text-[#949BA4]">
              Managed since {new Date(grantedAt).toLocaleDateString()}
              {creator.lastSnapshotAt && (
                <> · Last synced {formatRelativeTime(creator.lastSnapshotAt)}</>
              )}
            </div>
          </div>

          <Link href={`/creator/${creator.slug}`}>
            <Button variant="secondary" size="sm">
              View Public Profile
            </Button>
          </Link>
        </div>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-[#949BA4]">
            Total Followers
          </p>
          <p className="mt-1 text-xl font-bold text-[#F2F3F5]">
            {formatNumber(Number(creator.totalFollowers))}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-[#949BA4]">
            Total Views
          </p>
          <p className="mt-1 text-xl font-bold text-[#F2F3F5]">
            {formatNumber(Number(creator.totalViews))}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-[#949BA4]">
            Platforms
          </p>
          <p className="mt-1 text-xl font-bold text-[#F2F3F5]">
            {creator.platformAccounts.length}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-[#949BA4]">
            Primary
          </p>
          <p className="mt-1 text-xl font-bold text-[#F2F3F5]">
            {creator.primaryPlatform
              ? PLATFORM_CONFIG[creator.primaryPlatform].name
              : "—"}
          </p>
        </Card>
      </div>

      {/* Platform breakdown */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-[#F2F3F5]">
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
                className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#2B2D31] p-3"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: config.color }}
                >
                  <span className="text-xs font-bold text-white">
                    {config.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-[#DBDEE1]">
                      {config.name}
                    </span>
                    <span className="text-xs text-[#949BA4]">
                      @{account.platformUsername}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#F2F3F5]">
                      {formatNumber(Number(account.followerCount))}
                    </span>
                    {growth && growth.pct7d !== null && (
                      <span
                        className={`text-xs font-medium ${
                          growth.pct7d > 0
                            ? "text-[#22c55e]"
                            : growth.pct7d < 0
                              ? "text-[#E32C19]"
                              : "text-[#949BA4]"
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
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-[#F2F3F5]">
          Your Permissions
        </h3>
        <div className="flex flex-wrap gap-2">
          {PERMISSION_LABELS.map((perm) => (
            <Badge
              key={perm.key}
              className={
                permissions[perm.key]
                  ? "bg-[#22c55e]/10 text-[#22c55e]"
                  : "bg-[#383A40] text-[#949BA4] line-through"
              }
            >
              {perm.label}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Analytics (if permitted) */}
      {permissions.canViewAnalytics && (
        <AnalyticsSection creatorProfileId={creator.id} />
      )}

      {!permissions.canViewAnalytics && (
        <Card className="py-8 text-center">
          <p className="text-sm text-[#949BA4]">
            You don&apos;t have permission to view analytics for this creator.
          </p>
        </Card>
      )}
    </div>
  );
}
