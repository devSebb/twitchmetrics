import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreatorDetailView } from "./CreatorDetailView";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: { talentManager: { getCreatorAnalytics: { useQuery: query } } },
}));
const creator = {
  id: "fixture-creator",
  displayName: "Example creator",
  slug: "example",
  avatarUrl: null,
  primaryPlatform: "twitch" as const,
  totalFollowers: "1000",
  totalViews: "2000",
  state: "claimed",
  lastSnapshotAt: null,
  platformAccounts: [],
  growthRollups: [],
};
const permissions = {
  canViewAnalytics: false,
  canEditProfile: false,
  canExportData: false,
  canManageBrands: false,
};

beforeEach(() => {
  query.mockReset();
  query.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});
function render(canViewAnalytics: boolean) {
  return renderToStaticMarkup(
    <CreatorDetailView
      creator={creator}
      permissions={{ ...permissions, canViewAnalytics }}
      grantedAt="2026-01-01T00:00:00Z"
    />,
  );
}
describe("manager creator detail permissions", () => {
  it("does not request private analytics when the creator has not granted access", () => {
    const html = render(false);
    expect(query).not.toHaveBeenCalled();
    expect(html).toContain("permission to view analytics");
    expect(html).toContain("View Analytics: Not granted");
  });
  it("requests the existing creator and period when analytics are permitted", () => {
    const html = render(true);
    expect(query).toHaveBeenCalledWith({
      creatorProfileId: "fixture-creator",
      periodDays: 30,
    });
    expect(html).toContain("No analytics data available for this period");
    expect(html).toContain("View Analytics: Allowed");
  });
  it("distinguishes a query failure from an empty reporting period", () => {
    query.mockReturnValue({
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    const html = render(true);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Analytics could not load");
    expect(html).not.toContain("No analytics data available for this period");
  });
});
