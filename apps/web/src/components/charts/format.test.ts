import { describe, expect, it } from "vitest";
import { axisNumber, chartDateLabel, tooltipHtml, trendColor } from "./format";
import { THEME } from "@/lib/constants/theme";

describe("chartDateLabel", () => {
  it("labels calendar-date strings in UTC regardless of local timezone", () => {
    // A "2026-07-20" bucket must never label as 7/19 in negative-offset zones.
    expect(chartDateLabel("2026-07-20")).toBe("7/20");
    expect(chartDateLabel("2026-07-20", "full")).toBe("Jul 20, 2026");
  });

  it("labels full ISO instants without throwing", () => {
    expect(chartDateLabel("2026-07-20T15:30:00.000Z")).toMatch(/^\d+\/\d+$/);
  });
});

describe("axisNumber", () => {
  it("uses compact notation", () => {
    expect(axisNumber(1500)).toBe("1.5K");
    expect(axisNumber(999)).toBe("999");
  });
});

describe("trendColor", () => {
  it("maps sign to the shared trend colors", () => {
    expect(trendColor(5)).toBe(THEME.colors.success);
    expect(trendColor(-5)).toBe(THEME.colors.error);
    expect(trendColor(0)).toBe(THEME.colors.textMuted);
  });
});

describe("tooltipHtml", () => {
  it("renders title, bullets, labels, and bold values", () => {
    const html = tooltipHtml("Jul 20, 2026", [
      { bullet: "#9146ff", label: "Twitch", value: "1.2K" },
    ]);
    expect(html).toContain("Jul 20, 2026");
    expect(html).toContain('<span style="color:#9146ff">●</span>');
    expect(html).toContain("Twitch: <b>1.2K</b>");
  });

  it("escapes HTML in dynamic text", () => {
    const html = tooltipHtml("<img>", [{ value: "<script>" }]);
    expect(html).not.toContain("<img>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img&gt;");
  });
});
