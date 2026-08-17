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
import { FeaturedPostsSection } from "./sections/FeaturedPostsSection";
import { InterestsSection } from "./sections/InterestsSection";
import { StreamerQualitiesSection } from "./sections/StreamerQualitiesSection";
import { RatesSection } from "./sections/RatesSection";
import { WidgetToggle } from "./WidgetToggle";
import { WidgetCard } from "./WidgetCard";

// ----------------------------------------------------------------
// Types for serialized profile data passed from the server page
// ----------------------------------------------------------------

export type SerializedPlatformAccount = {
  platform: Platform;
  platformAvatarUrl?: string | null;
  followerCount: string | null;
  totalViews: string | null;
  lastSyncedAt: string | null;
  isOAuthConnected: boolean;
  // Link-only social accounts (e.g. StreamHatchet-discovered IG/TikTok/X) set
  // this; NULL/undefined = a tracked account with snapshot history.
  discoverySource?: string | null;
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

export type SerializedDemographicAnalytics = {
  platform: Platform;
  ageGenderData: unknown;
  countryData: unknown;
};

// Third-party social-audience estimates (AudienceDemographics rows from the
// Stream Hatchet / DemographicsPro feed). Distributions are bucket→percent
// (0-100). One row per social network; ordered by reach desc server-side.
export type SerializedAudienceDemographics = {
  platform: Platform;
  ages: unknown;
  genders: unknown;
  countries: unknown;
  income: unknown;
  reach: string | null;
  dpUpdatedAt: string | null;
};

export type SerializedProfile = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  customAvatarUrl?: string | null;
  bio: string | null;
  country: string | null;
  language?: string | null;
  gender?: string | null;
  age?: number | null;
  interests?: string[] | null;
  ownerEmail?: string | null;
  ownerImage?: string | null;
  primaryPlatform: Platform;
  totalFollowers: string;
  totalViews: string;
  widgetConfig: unknown;
  publicDemographicsEnabled: boolean;
  platformAccounts: SerializedPlatformAccount[];
  growthRollups: SerializedGrowthRollup[];
  brandPartnerships: SerializedBrandPartnership[];
  demographicAnalytics?: SerializedDemographicAnalytics[];
  audienceDemographics?: SerializedAudienceDemographics[];
};

type DashboardGridProps = {
  profile: SerializedProfile;
  widgetConfig: unknown;
  isClaimed: boolean;
  isOwner: boolean;
  /** Controlled state for the WidgetToggle drawer. Required for owner mode; ignored otherwise. */
  customizeOpen?: boolean;
  onCustomizeClose?: () => void;
};

// ----------------------------------------------------------------
// Access-gated widget renderer
//
// Locked widgets (claim/connect required) always render a card so the
// viewer knows they can unlock it. Unlocked widgets render a regular card
// whose body includes the widget; widgets that have no data render an
// `<EmptyWidgetSentinel />` which the card's CSS uses via `:has()` to
// hide the entire card. The widget stays enabled in config, so it
// reappears automatically once data arrives.
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
  customizeOpen,
  onCustomizeClose,
}: DashboardGridProps) {
  const [enabledWidgets, setEnabledWidgets] = useState<WidgetId[]>(() =>
    getEnabledWidgets(widgetConfig),
  );

  const enabledSet = new Set(enabledWidgets);

  const handleWidgetConfigChange = useCallback((newConfig: WidgetId[]) => {
    setEnabledWidgets(newConfig);
  }, []);

  return (
    <div>
      {/* Content area — flex+gap (not space-y) so hidden/collapsed rows don't leave ghost margins. */}
      <div className="flex flex-col gap-4">
        {/* Row 1: Stats Row — full width */}
        {renderGated(
          "stats_row",
          enabledSet,
          isClaimed,
          <StatsRow profile={profile} />,
        )}

        {/* Row 2: Audience Demographics (2/3) | Brand Partners (1/3).
            Flex basis + grow (not fixed grid tracks) so whichever card is
            hidden — disabled, or self-hidden when empty — lets the other
            expand to full width instead of leaving a dead column. */}
        <div className="flex flex-col gap-4 empty:hidden lg:flex-row">
          {renderGated(
            "demographics",
            enabledSet,
            isClaimed,
            <DemographicsWidget
              profile={profile}
              isClaimed={isClaimed}
              isOwner={isOwner}
            />,
            "min-w-0 lg:basis-2/3 lg:grow",
          )}
          {renderGated(
            "brand_partners",
            enabledSet,
            isClaimed,
            <BrandPartnersWidget profile={profile} isOwner={isOwner} />,
            "min-w-0 lg:basis-1/3 lg:grow",
          )}
        </div>

        {/* Row 3: Popular Games (35%) | Recent Streams (65%) — fixed height, scrollable */}
        <div className="grid grid-cols-1 gap-4 empty:hidden lg:grid-cols-[35fr_65fr]">
          {renderGated(
            "popular_games",
            enabledSet,
            isClaimed,
            <PopularGamesWidget profile={profile} />,
            "h-80",
          )}
          {renderGated(
            "recent_streams",
            enabledSet,
            isClaimed,
            <RecentStreamsWidget profile={profile} />,
            "h-80",
          )}
        </div>

        {/* Row 4: Featured Clips — full width */}
        {renderGated(
          "featured_clips",
          enabledSet,
          isClaimed,
          <FeaturedClipsWidget profile={profile} />,
        )}

        {/* Row 5: Follower Growth (1/2) | Viewer Count (1/2) */}
        <div className="grid grid-cols-1 gap-4 empty:hidden lg:grid-cols-2">
          {renderGated(
            "follower_growth",
            enabledSet,
            isClaimed,
            <FollowerGrowthWidget profile={profile} />,
          )}
          {renderGated(
            "viewer_count",
            enabledSet,
            isClaimed,
            <ViewerCountWidget profile={profile} />,
          )}
        </div>

        {/* Row 6: Featured Posts — full width */}
        {renderGated(
          "featured_posts",
          enabledSet,
          isClaimed,
          <FeaturedPostsSection />,
        )}

        {/* Row 7: Interests (1/2) | Streamer Qualities (1/2) */}
        <div className="grid grid-cols-1 gap-4 empty:hidden md:grid-cols-2">
          {renderGated(
            "interests",
            enabledSet,
            isClaimed,
            <InterestsSection interests={profile.interests ?? []} />,
          )}
          {renderGated(
            "streamer_qualities",
            enabledSet,
            isClaimed,
            <StreamerQualitiesSection />,
          )}
        </div>

        {/* Row 8: Rates (1/2) | Brand Safety (1/2) */}
        <div className="grid grid-cols-1 gap-4 empty:hidden md:grid-cols-2">
          {renderGated("rates", enabledSet, isClaimed, <RatesSection />)}
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

      {/* Widget toggle drawer — controlled by parent in owner mode. */}
      {isOwner && customizeOpen !== undefined && (
        <WidgetToggle
          open={customizeOpen}
          onClose={onCustomizeClose ?? (() => undefined)}
          enabledWidgets={enabledWidgets}
          onConfigChange={handleWidgetConfigChange}
          profileSlug={profile.slug}
          publicDemographicsEnabled={profile.publicDemographicsEnabled}
        />
      )}
    </div>
  );
}
