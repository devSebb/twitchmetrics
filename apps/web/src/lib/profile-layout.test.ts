import { describe, expect, it } from "vitest";
import {
  WIDGET_ORDER,
  WIDGET_REGISTRY,
  type WidgetId,
} from "@/lib/constants/widgets";
import { GRID_COLUMNS, packProfileLayout } from "./profile-layout";

type Shape = [WidgetId, number][][];

const shape = (present: WidgetId[]): Shape =>
  packProfileLayout(present).rows.map((row) =>
    row.map((cell) => [cell.id, cell.span]),
  );

describe("packProfileLayout", () => {
  it("keeps the full profile layout (all default widgets present)", () => {
    const layout = packProfileLayout([
      "stats_row",
      "demographics",
      "brand_partners",
      "popular_games",
      "recent_streams",
      "featured_clips",
      "follower_growth",
      "viewer_count",
      "platform_breakdown",
    ]);
    expect(layout.pinned).toEqual(["stats_row"]);
    expect(layout.rows.map((row) => row.map((c) => [c.id, c.span]))).toEqual([
      [
        ["demographics", 8],
        ["brand_partners", 4],
      ],
      [
        ["popular_games", 4],
        ["recent_streams", 8],
      ],
      [["featured_clips", 12]],
      [
        ["follower_growth", 6],
        ["viewer_count", 6],
      ],
      [["platform_breakdown", 12]],
    ]);
  });

  // The most common listed-profile shapes from the 2026-10-19 prod census.
  it("moves Brand Partners beside a chart when Demographics is missing (35% of profiles)", () => {
    expect(
      shape([
        "stats_row",
        "brand_partners",
        "popular_games",
        "recent_streams",
        "viewer_count",
        "platform_breakdown",
      ]),
    ).toEqual([
      [
        ["popular_games", 4],
        ["recent_streams", 8],
      ],
      [
        ["brand_partners", 4],
        ["viewer_count", 8],
      ],
      [["platform_breakdown", 12]],
    ]);
  });

  it("pairs Brand Partners with Recent Streams when there are no games (26%)", () => {
    expect(
      shape([
        "stats_row",
        "brand_partners",
        "recent_streams",
        "platform_breakdown",
      ]),
    ).toEqual([
      [
        ["brand_partners", 4],
        ["recent_streams", 8],
      ],
      [["platform_breakdown", 12]],
    ]);
  });

  it("pairs charts with charts and short cards with short cards (14%)", () => {
    expect(
      shape([
        "brand_partners",
        "popular_games",
        "recent_streams",
        "follower_growth",
        "viewer_count",
        "platform_breakdown",
      ]),
    ).toEqual([
      [
        ["popular_games", 4],
        ["recent_streams", 8],
      ],
      [
        ["follower_growth", 6],
        ["viewer_count", 6],
      ],
      [
        ["brand_partners", 4],
        ["platform_breakdown", 8],
      ],
    ]);
  });

  it("never puts a tall chart beside a short card (HYBE / T-Series)", () => {
    expect(
      shape([
        "stats_row",
        "brand_partners",
        "recent_streams",
        "follower_growth",
        "platform_breakdown",
      ]),
    ).toEqual([
      [
        ["brand_partners", 4],
        ["recent_streams", 8],
      ],
      [["follower_growth", 12]],
      [["platform_breakdown", 12]],
    ]);
  });

  it("stretches Brand Partners only when nothing can share its row", () => {
    expect(shape(["stats_row", "brand_partners"])).toEqual([
      [["brand_partners", 12]],
    ]);
  });

  it("returns no rows when only pinned widgets are present", () => {
    expect(packProfileLayout(["stats_row"])).toEqual({
      pinned: ["stats_row"],
      rows: [],
    });
  });

  it("fills every row exactly with one height class, for every combination", () => {
    const packable = WIDGET_ORDER.filter((id) => id !== "stats_row");
    for (let mask = 0; mask < 1 << packable.length; mask++) {
      const present = packable.filter((_, bit) => mask & (1 << bit));
      const { rows } = packProfileLayout(present);
      for (const row of rows) {
        expect(row.reduce((sum, cell) => sum + cell.span, 0)).toBe(
          GRID_COLUMNS,
        );
        const heights = new Set(
          row
            .filter((cell) => !WIDGET_REGISTRY[cell.id].layout.filler)
            .map((cell) => WIDGET_REGISTRY[cell.id].layout.height),
        );
        expect(heights.size).toBeLessThanOrEqual(1);
      }
      expect(
        rows
          .flat()
          .map((cell) => cell.id)
          .sort(),
      ).toEqual([...present].sort());
    }
  });
});
