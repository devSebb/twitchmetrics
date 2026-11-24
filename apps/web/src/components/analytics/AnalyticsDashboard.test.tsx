import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
vi.mock("./DemographicsCharts", () => ({ DemographicsCharts: () => null }));
describe("private analytics platform selection", () => {
  it("keeps all platform choices available when the selected platform has no data", () => {
    const html = renderToStaticMarkup(
      <AnalyticsDashboard analytics={[]} platforms={["youtube", "twitch"]} />,
    );
    expect(html).toContain("YouTube");
    expect(html).toContain("Twitch");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("No connected analytics are available");
    expect(html).not.toContain("Estimated revenue");
  });
});
