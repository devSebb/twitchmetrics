"use client";

import { useState, useCallback, useMemo } from "react";
import type { Platform } from "@twitchmetrics/database";
import {
  WIDGET_REGISTRY,
  getEnabledWidgets,
  type WidgetId,
} from "@/lib/constants/widgets";
import {
  packProfileLayout,
  type LayoutCell,
  type ProfileDataAvailability,
} from "@/lib/profile-layout";
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
  hasPublicDemographics,
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
  /** Set server-side by selectDisplayableDemographics; `stale` renders a warning. */
  freshness?: "fresh" | "stale";
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
  /**
   * Server-checked data availability for client-loaded widgets. Without it
   * those widgets are assumed present and fall back to self-hiding.
   */
  dataAvailability?: ProfileDataAvailability | undefined;
  /** Controlled state for the WidgetToggle drawer. Required for owner mode; ignored otherwise. */
  customizeOpen?: boolean;
  onCustomizeClose?: () => void;
};

// ----------------------------------------------------------------
// Which widgets will render
//
// The grid packs only widgets that will actually show something, so a
// missing card never leaves a hole (lib/profile-layout.ts). Owners still
// see empty states and calls to action for widgets they enabled.
// ----------------------------------------------------------------

type ContentContext = {
  profile: SerializedProfile;
  widgetConfig: unknown;
  isClaimed: boolean;
  isOwner: boolean;
  dataAvailability: ProfileDataAvailability | undefined;
};

function hasContent(widgetId: WidgetId, ctx: ContentContext): boolean {
  switch (widgetId) {
    case "demographics":
      return ctx.isOwner || hasPublicDemographics(ctx.profile, ctx.isClaimed);
    case "brand_partners":
      // Unclaimed: the locked "Claim Required" card. Claimed with no
      // partners: hidden by default, shown only when the owner kept it in
      // their saved widget config (an empty config means defaults).
      return (
        ctx.isOwner ||
        !ctx.isClaimed ||
        ctx.profile.brandPartnerships.length > 0 ||
        (Array.isArray(ctx.widgetConfig) &&
          ctx.widgetConfig.includes("brand_partners"))
      );
    case "platform_breakdown":
      return ctx.profile.platformAccounts.some(
        (account) => Number(account.followerCount ?? 0) > 0,
      );
    case "popular_games":
    case "recent_streams":
    case "viewer_count":
    case "follower_growth":
    case "featured_clips":
      return ctx.dataAvailability?.[widgetId] ?? true;
    default:
      return true;
  }
}

// ----------------------------------------------------------------
// Card sizing
// ----------------------------------------------------------------

// Static class names so Tailwind keeps them (spans are twelfths).
const SPAN_BASIS: Record<number, string> = {
  1: "lg:basis-1/12",
  2: "lg:basis-2/12",
  3: "lg:basis-3/12",
  4: "lg:basis-4/12",
  5: "lg:basis-5/12",
  6: "lg:basis-6/12",
  7: "lg:basis-7/12",
  8: "lg:basis-8/12",
  9: "lg:basis-9/12",
  10: "lg:basis-10/12",
  11: "lg:basis-11/12",
  12: "lg:basis-full",
};

// Scrollable list widgets keep a fixed height; cards sharing their row
// match it on desktop.
const FIXED_HEIGHT_WIDGETS = new Set<WidgetId>([
  "popular_games",
  "recent_streams",
]);

// Rows are flex (basis + grow), not fixed grid tracks: if a card still
// self-hides client-side, its neighbours grow into the space instead of
// leaving a hole. A row whose cards all hid collapses, so the column gap
// doesn't double up. Browsers drop :has() nested inside :has(), so the
// "all cards empty" check is spelled out for 1- and 2-card rows (the
// packer never builds wider rows).
const ROW_CLASS = [
  "flex flex-col gap-4 lg:flex-row",
  "[&:has(>[data-widget-id]:only-child_[data-widget-empty])]:hidden",
  "[&:has(>[data-widget-id]:first-child_[data-widget-empty]):has(>[data-widget-id]:nth-child(2):last-child_[data-widget-empty])]:hidden",
].join(" ");

function cellClassName(cell: LayoutCell, rowHasFixedHeight: boolean): string {
  const height = FIXED_HEIGHT_WIDGETS.has(cell.id)
    ? "h-80"
    : rowHasFixedHeight
      ? "lg:h-80 lg:overflow-y-auto"
      : "";
  return `min-w-0 lg:grow ${SPAN_BASIS[cell.span] ?? ""} ${height}`;
}

// ----------------------------------------------------------------
// Access-gated widget renderer
//
// Locked widgets (claim/connect required) render a locked card so the
// viewer knows they can unlock it. Widgets that turn out empty client-side
// render `<EmptyWidgetSentinel />`, which hides the card via `:has()`.
// ----------------------------------------------------------------

function renderGated(
  widgetId: WidgetId,
  isClaimed: boolean,
  children: React.ReactNode,
  className?: string,
): React.ReactNode {
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
          className="flex-1"
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
          className="flex-1"
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

function renderWidget(
  widgetId: WidgetId,
  profile: SerializedProfile,
  isClaimed: boolean,
  isOwner: boolean,
): React.ReactNode {
  switch (widgetId) {
    case "stats_row":
      return <StatsRow profile={profile} />;
    case "demographics":
      return (
        <DemographicsWidget
          profile={profile}
          isClaimed={isClaimed}
          isOwner={isOwner}
        />
      );
    case "brand_partners":
      return <BrandPartnersWidget profile={profile} isOwner={isOwner} />;
    case "popular_games":
      return <PopularGamesWidget profile={profile} />;
    case "recent_streams":
      return <RecentStreamsWidget profile={profile} />;
    case "featured_clips":
      return <FeaturedClipsWidget profile={profile} />;
    case "featured_posts":
      return <FeaturedPostsSection />;
    case "follower_growth":
      return <FollowerGrowthWidget profile={profile} />;
    case "viewer_count":
      return <ViewerCountWidget profile={profile} />;
    case "interests":
      return <InterestsSection interests={profile.interests ?? []} />;
    case "streamer_qualities":
      return <StreamerQualitiesSection />;
    case "rates":
      return <RatesSection />;
    case "brand_safety":
      return <BrandSafetyWidget profile={profile} isClaimed={isClaimed} />;
    case "platform_breakdown":
      return <PlatformBreakdownWidget profile={profile} isOwner={isOwner} />;
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
  dataAvailability,
  customizeOpen,
  onCustomizeClose,
}: DashboardGridProps) {
  const [enabledWidgets, setEnabledWidgets] = useState<WidgetId[]>(() =>
    getEnabledWidgets(widgetConfig),
  );

  const handleWidgetConfigChange = useCallback((newConfig: WidgetId[]) => {
    setEnabledWidgets(newConfig);
  }, []);

  const layout = useMemo(() => {
    const ctx: ContentContext = {
      profile,
      widgetConfig,
      isClaimed,
      isOwner,
      dataAvailability,
    };
    return packProfileLayout(
      enabledWidgets.filter((widgetId) => hasContent(widgetId, ctx)),
    );
  }, [
    enabledWidgets,
    profile,
    widgetConfig,
    isClaimed,
    isOwner,
    dataAvailability,
  ]);

  return (
    <div>
      {/* flex+gap (not space-y) so hidden rows don't leave ghost margins. */}
      <div className="flex flex-col gap-4">
        {layout.pinned.map((widgetId) =>
          renderGated(
            widgetId,
            isClaimed,
            renderWidget(widgetId, profile, isClaimed, isOwner),
          ),
        )}

        {layout.rows.map((row) => {
          const rowHasFixedHeight = row.some((cell) =>
            FIXED_HEIGHT_WIDGETS.has(cell.id),
          );
          return (
            <div
              key={row.map((cell) => cell.id).join("+")}
              className={ROW_CLASS}
            >
              {row.map((cell) =>
                renderGated(
                  cell.id,
                  isClaimed,
                  renderWidget(cell.id, profile, isClaimed, isOwner),
                  cellClassName(cell, rowHasFixedHeight),
                ),
              )}
            </div>
          );
        })}
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
