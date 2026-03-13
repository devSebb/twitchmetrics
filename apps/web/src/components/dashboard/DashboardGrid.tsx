"use client";

import { useState, useCallback } from "react";
import type { Platform } from "@twitchmetrics/database";
import {
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
import { DashboardProfileHeader } from "./DashboardProfileHeader";
import { CategoriesSection } from "./sections/CategoriesSection";
import { FeaturedPostsSection } from "./sections/FeaturedPostsSection";
import { InterestsSection } from "./sections/InterestsSection";
import { StreamerQualitiesSection } from "./sections/StreamerQualitiesSection";
import { RatesSection } from "./sections/RatesSection";
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
// Widget card wrapper
// ----------------------------------------------------------------

function WidgetCard({
  widgetId,
  children,
  className,
}: {
  widgetId: WidgetId;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  const def = WIDGET_REGISTRY[widgetId];
  return (
    <div
      className={`rounded-xl border border-[#3F4147] bg-[#313338] p-5 ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#F2F3F5]">{def.label}</h3>
      </div>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------
// Access-gated widget renderer
// ----------------------------------------------------------------

function renderGated(
  widgetId: WidgetId,
  enabledSet: Set<WidgetId>,
  isClaimed: boolean,
  children: React.ReactNode,
  className?: string,
): React.ReactNode {
  if (!enabledSet.has(widgetId)) return null;

  const def = WIDGET_REGISTRY[widgetId];
  const cardProps = className ? { widgetId, className } : { widgetId };

  if (def.access === "claimed" && !isClaimed) {
    return (
      <WidgetCard key={widgetId} {...cardProps}>
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
      <WidgetCard key={widgetId} {...cardProps}>
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

  return (
    <WidgetCard key={widgetId} {...cardProps}>
      {children}
    </WidgetCard>
  );
}

// ----------------------------------------------------------------
// Main Grid Component — Figma V7 section layout
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
    <div>
      {/* Profile Header — full bleed */}
      <DashboardProfileHeader profile={profile} isOwner={isOwner} />

      {/* Content area */}
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        {/* Customize button */}
        {isOwner && (
          <div className="flex justify-end">
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
          </div>
        )}

        {/* Row 1: Stats Row — full width */}
        {renderGated(
          "stats_row",
          enabledSet,
          isClaimed,
          <StatsRow profile={profile} />,
        )}

        {/* Row 2: Brand Partners (2/3) | Channel Audience (1/3) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {renderGated(
            "brand_partners",
            enabledSet,
            isClaimed,
            <BrandPartnersWidget profile={profile} isOwner={isOwner} />,
            "lg:col-span-2",
          )}
          {renderGated(
            "demographics",
            enabledSet,
            isClaimed,
            <DemographicsWidget profile={profile} isClaimed={isClaimed} />,
          )}
        </div>

        {/* Row 3: Popular Games (1/3) | Categories (1/3) | Last Streams (1/3) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {renderGated(
            "popular_games",
            enabledSet,
            isClaimed,
            <PopularGamesWidget profile={profile} />,
          )}
          <CategoriesSection />
          {renderGated(
            "recent_streams",
            enabledSet,
            isClaimed,
            <RecentStreamsWidget profile={profile} />,
          )}
        </div>

        {/* Row 4: Featured Clips — full width */}
        {renderGated(
          "featured_clips",
          enabledSet,
          isClaimed,
          <FeaturedClipsWidget profile={profile} />,
        )}

        {/* Row 5: Follower Growth (2/3) | Viewer Count (1/3) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {renderGated(
            "follower_growth",
            enabledSet,
            isClaimed,
            <FollowerGrowthWidget profile={profile} />,
            "lg:col-span-2",
          )}
          {renderGated(
            "viewer_count",
            enabledSet,
            isClaimed,
            <ViewerCountWidget profile={profile} />,
          )}
        </div>

        {/* Row 6: Featured Posts — full width */}
        <FeaturedPostsSection />

        {/* Row 7: Interests (1/2) | Streamer Qualities (1/2) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InterestsSection />
          <StreamerQualitiesSection />
        </div>

        {/* Row 8: Rates (1/2) | Brand Safety (1/2) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RatesSection />
          {renderGated(
            "brand_safety",
            enabledSet,
            isClaimed,
            <BrandSafetyWidget profile={profile} isClaimed={isClaimed} />,
          )}
        </div>

        {/* Row 9: Platform Breakdown — full width */}
        {renderGated(
          "platform_breakdown",
          enabledSet,
          isClaimed,
          <PlatformBreakdownWidget profile={profile} />,
        )}
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
