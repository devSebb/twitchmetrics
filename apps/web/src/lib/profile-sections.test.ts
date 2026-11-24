import { describe, expect, it } from "vitest";
import {
  getEnabledWidgets,
  WIDGET_REGISTRY,
  type WidgetId,
} from "./constants/widgets";
import { groupProfileWidgets, publicMediaKitUrl } from "./profile-sections";

describe("editorial profile composition", () => {
  it("retains every existing widget exactly once, including optional saved widgets", () => {
    const all = Object.keys(WIDGET_REGISTRY) as WidgetId[];
    const placed = groupProfileWidgets(all).flatMap(
      (section) => section.widgets,
    );
    expect(new Set(placed).size).toBe(all.length);
    expect([...placed].sort()).toEqual([...all].sort());
  });
  it("honours saved visibility and omits empty navigation destinations", () => {
    const enabled = getEnabledWidgets([
      "follower_growth",
      "rates",
      "unknown",
      "follower_growth",
    ]);
    const groups = groupProfileWidgets(enabled);
    expect(groups.map((section) => section.id)).toEqual([
      "performance",
      "more",
    ]);
    expect(groups.flatMap((section) => section.widgets)).toEqual([
      "follower_growth",
      "rates",
    ]);
    expect(groupProfileWidgets([])).toEqual([]);
  });
  it("retains the established default widget configuration", () => {
    const defaults = getEnabledWidgets([]);
    expect(
      groupProfileWidgets(defaults)
        .flatMap((section) => section.widgets)
        .sort(),
    ).toEqual(defaults.sort());
  });
});

describe("public media-kit sharing", () => {
  it("uses the canonical public destination independently of a private preview URL", () => {
    expect(publicMediaKitUrl("https://example.com/", "creator-name")).toBe(
      "https://example.com/creator/creator-name/media-kit",
    );
    expect(publicMediaKitUrl("https://example.com", "name?preview=true")).toBe(
      "https://example.com/creator/name%3Fpreview%3Dtrue/media-kit",
    );
  });
});
