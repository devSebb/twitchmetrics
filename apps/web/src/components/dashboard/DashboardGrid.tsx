"use client";

import { useState, useCallback } from "react";
import type { Platform } from "@twitchmetrics/database";
import {
  WIDGET_ORDER,
  WIDGET_REGISTRY,
  getEnabledWidgets,
  type WidgetId,
} from "@/lib/constants/widgets";
import {
  EmptyState,
  StatsRow,
  FollowerGrowthWidget,
  ViewerCountWidget,
  DemographicsWidget,
  PopularGamesWidget,
  PlatformBreakdownWidget,
  RecentStreamsWidget,
  FeaturedClipsWidget,
  BrandPartnersWidget,
  BrandSafetyWidget,
} from "@/components/widgets";
import { WidgetToggle } from "./WidgetToggle";

// ----------------------------------------------------------------
// Types for serialized profile data passed from the server page
// ----------------------------------------------------------------

export type SerializedPlatformAccount = {
  platform: Platform;
  followerCount: string | null;
  totalViews: string | null;
  lastSyncedAt: string | null;
  isOAuthConnected: boolean;
};

export type SerializedGrowthRollup = {
  platform: Platform;
  followerCount: string | null;
  delta1d: string | null;
  delta7d: string | null;
  delta30d: string | null;
  pct1d: number | null;
  pct7d: number | null;
  pct30d: number | null;
  trendDirection: string | null;
  acceleration: number | null;
  computedAt: string | null;
};

export type SerializedBrandPartnership = {
  id: string;
  brandName: string;
  brandLogoUrl: string | null;
  campaignName: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type SerializedProfile = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  country: string | null;
  primaryPlatform: Platform;
  totalFollowers: string;
  totalViews: string;
  widgetConfig: unknown;
  platformAccounts: SerializedPlatformAccount[];
  growthRollups: SerializedGrowthRollup[];
  brandPartnerships: SerializedBrandPartnership[];
};

type DashboardGridProps = {
  profile: SerializedProfile;
  widgetConfig: unknown;
  isClaimed: boolean;
  isOwner: boolean;
};

// ----------------------------------------------------------------
// Column span → Tailwind class (pre-defined to survive purge)
// ----------------------------------------------------------------

const COL_SPAN: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-1 md:col-span-2",
  3: "col-span-1 md:col-span-2 lg:col-span-3",
};

// ----------------------------------------------------------------
// Widget card wrapper
// ----------------------------------------------------------------

function WidgetCard({
  widgetId,
  children,
}: {
  widgetId: WidgetId;
  children: React.ReactNode;
}) {
  const def = WIDGET_REGISTRY[widgetId];
  return (
    <div
      className={`rounded-xl border border-[#3F4147] bg-[#313338] p-5 ${COL_SPAN[def.colSpan]}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#F2F3F5]">{def.label}</h3>
      </div>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------
// Placeholder fallback
// ----------------------------------------------------------------

function WidgetPlaceholder({ widgetId }: { widgetId: WidgetId }) {
  const def = WIDGET_REGISTRY[widgetId];
  return (
    <EmptyState
      variant="no_data"
      title={def.label}
      message="Coming soon"
      compact
    />
  );
}

// ----------------------------------------------------------------
// Widget renderer — maps widgetId to real components
// ----------------------------------------------------------------

function renderWidget(
  widgetId: WidgetId,
  profile: SerializedProfile,
  isClaimed: boolean,
  isOwner: boolean,
): React.ReactNode {
  switch (widgetId) {
    case "stats_row":
      return <StatsRow profile={profile} />;
    case "follower_growth":
      return <FollowerGrowthWidget profile={profile} />;
    case "viewer_count":
      return <ViewerCountWidget profile={profile} />;
    case "demographics":
      return <DemographicsWidget profile={profile} isClaimed={isClaimed} />;
    case "popular_games":
      return <PopularGamesWidget profile={profile} />;
    case "platform_breakdown":
      return <PlatformBreakdownWidget profile={profile} />;
    case "recent_streams":
      return <RecentStreamsWidget profile={profile} />;
    case "featured_clips":
      return <FeaturedClipsWidget profile={profile} />;
    case "brand_partners":
      return <BrandPartnersWidget profile={profile} isOwner={isOwner} />;
    case "brand_safety":
      return <BrandSafetyWidget profile={profile} isClaimed={isClaimed} />;
    default:
      return <WidgetPlaceholder widgetId={widgetId} />;
  }
}

// ----------------------------------------------------------------
// Main Grid Component
// ----------------------------------------------------------------

export function DashboardGrid({
  profile,
  widgetConfig,
  isClaimed,
  isOwner,
}: DashboardGridProps) {
  const [enabledWidgets, setEnabledWidgets] = useState<WidgetId[]>(() =>
    getEnabledWidgets(widgetConfig),
  );
  const [toggleOpen, setToggleOpen] = useState(false);

  const enabledSet = new Set(enabledWidgets);

  const handleWidgetConfigChange = useCallback((newConfig: WidgetId[]) => {
    setEnabledWidgets(newConfig);
  }, []);

  return (
    <div className="space-y-6">
      {/* Dashboard header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F2F3F5]">
            {profile.displayName}
          </h1>
          <p className="mt-1 text-sm text-[#949BA4]">Creator Dashboard</p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => setToggleOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-xs font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
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
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Customize
          </button>
        )}
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {WIDGET_ORDER.map((widgetId) => {
          if (!enabledSet.has(widgetId)) return null;

          const def = WIDGET_REGISTRY[widgetId];

          // Access gate: show locked empty state for restricted widgets
          if (def.access === "claimed" && !isClaimed) {
            return (
              <WidgetCard key={widgetId} widgetId={widgetId}>
                <EmptyState
                  variant="locked"
                  title="Claim Required"
                  message="Claim your profile to unlock this widget."
                  actionLabel="Claim Profile"
                  actionHref="/dashboard/claim"
                  compact
                />
              </WidgetCard>
            );
          }

          if (def.access === "connected" && !isClaimed) {
            return (
              <WidgetCard key={widgetId} widgetId={widgetId}>
                <EmptyState
                  variant="locked"
                  title="Connect Accounts"
                  message="Connect your platforms to see this data."
                  actionLabel="Connect"
                  actionHref="/dashboard/connections"
                  compact
                />
              </WidgetCard>
            );
          }

          // Render P0 widgets or placeholder for P1/P2
          return (
            <WidgetCard key={widgetId} widgetId={widgetId}>
              {renderWidget(widgetId, profile, isClaimed, isOwner)}
            </WidgetCard>
          );
        })}
      </div>

      {/* Widget toggle drawer */}
      {isOwner && (
        <WidgetToggle
          open={toggleOpen}
          onClose={() => setToggleOpen(false)}
          enabledWidgets={enabledWidgets}
          onConfigChange={handleWidgetConfigChange}
          profileSlug={profile.slug}
        />
      )}
    </div>
  );
}
