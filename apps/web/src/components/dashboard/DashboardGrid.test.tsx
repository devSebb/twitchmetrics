import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/components/ui/Appearance";
import { DashboardGrid, type SerializedProfile } from "./DashboardGrid";
vi.mock("@/components/widgets", () => ({
  EmptyState: () => null,
  StatsRow: () => null,
  FollowerGrowthWidget: () => null,
  ViewerCountWidget: () => null,
  PopularGamesWidget: () => null,
  PlatformBreakdownWidget: () => null,
  RecentStreamsWidget: () => null,
  FeaturedClipsWidget: () => null,
  BrandSafetyWidget: () => null,
  DemographicsWidget: ({ isOwner }: { isOwner: boolean }) =>
    `demographics-owner:${isOwner}`,
  BrandPartnersWidget: ({ isOwner }: { isOwner: boolean }) =>
    `partners-owner:${isOwner}`,
  hasPublicDemographics: () => false,
}));
vi.mock("./WidgetToggle", () => ({
  WidgetToggle: () => "owner-customisation",
}));
const profile: SerializedProfile = {
  id: "fixture",
  displayName: "Example",
  slug: "example",
  avatarUrl: null,
  bio: null,
  country: null,
  primaryPlatform: "twitch",
  totalFollowers: "100",
  totalViews: "200",
  widgetConfig: [],
  publicDemographicsEnabled: false,
  platformAccounts: [],
  growthRollups: [],
  brandPartnerships: [],
};
function render(
  isOwner: boolean,
  widgetConfig = ["demographics", "brand_partners"],
) {
  return renderToStaticMarkup(
    <AppearanceProvider>
      <DashboardGrid
        profile={profile}
        widgetConfig={widgetConfig}
        isClaimed
        isOwner={isOwner}
        customizeOpen
      />
    </AppearanceProvider>,
  );
}
describe("editorial owner profile", () => {
  it("retains owner-only audience and partnership editing in the new composition", () => {
    const html = render(true);
    expect(html).toContain("demographics-owner:true");
    expect(html).toContain("partners-owner:true");
    expect(html).toContain("owner-customisation");
  });
  it("does not expose private audience data or owner controls to a public visitor", () => {
    const html = render(false);
    expect(html).not.toContain("demographics-owner");
    expect(html).not.toContain("owner-customisation");
    expect(html).not.toContain("partners-owner:true");
  });
  it("honours saved widget selection when arranging owner sections", () => {
    const html = render(true, ["brand_partners"]);
    expect(html).toContain("partners-owner:true");
    expect(html).not.toContain("demographics-owner");
  });
});
