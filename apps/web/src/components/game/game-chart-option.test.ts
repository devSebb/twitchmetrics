import { describe, expect, it } from "vitest";
import type { LineSeriesOption } from "echarts";
import { buildGameChartOption, estimatedRuns } from "./game-chart-option";
import type { GameSeries } from "@/server/services/game-viewer-series";

const slots = [0, 1, 2, 3].map((index) =>
  new Date(Date.UTC(2026, 10, 20, 0, index * 30)).toISOString(),
);
const series: GameSeries = {
  slots,
  viewers: { twitch: [100, null, 0, 200], kick: [20, 30, null, 40] },
  channels: { twitch: [5, null, 0, 9], kick: [2, 3, null, 4] },
  estimated: { twitch: [[1, 2]], kick: [[2, 3]] },
};
const lines = (metric: "viewers" | "channels") =>
  buildGameChartOption(series, metric).series as LineSeriesOption[];

describe("Noticed category chart information parity", () => {
  it("keeps every original timestamp, zero and missing value in the stacked viewer lines", () => {
    const [twitch, kick] = lines("viewers");
    expect(twitch?.data).toEqual(
      slots.map((at, i) => [Date.parse(at), series.viewers.twitch![i]]),
    );
    expect(kick?.data).toEqual(
      slots.map((at, i) => [Date.parse(at), series.viewers.kick![i]]),
    );
    for (const line of [twitch, kick]) {
      expect(line?.stack).toBe("platforms");
      expect(line?.smooth).toBe(false);
      expect(line?.symbol).toBe("none");
    }
  });
  it("uses channel observations for the channel chart without applying estimated viewer overlays", () => {
    const channels = lines("channels");
    expect(channels).toHaveLength(2);
    expect(channels[0]?.data).toEqual(
      slots.map((at, i) => [Date.parse(at), series.channels.twitch![i]]),
    );
    expect(channels.every((line) => !line.markArea)).toBe(true);
  });
  it("preserves merged daily-average intervals and their source explanation", () => {
    expect(estimatedRuns(series)).toEqual([[1, 3]]);
    const overlay = lines("viewers")[2];
    expect(overlay?.markArea?.data).toEqual([
      [
        { xAxis: Date.parse(slots[1]!), name: "Daily average" },
        { xAxis: Date.parse(slots[3]!) },
      ],
    ]);
    const option = buildGameChartOption(series, "viewers");
    const tooltip = option.tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([
      {
        seriesName: "Twitch",
        value: [Date.parse(slots[2]!), 0],
        color: "#7C3AD1",
      },
      {
        seriesName: "Kick",
        value: [Date.parse(slots[2]!), null],
        color: "#34821B",
      },
    ]);
    expect(html).toContain("Daily average: no live readings");
    expect(html).toContain("Twitch");
    expect(html).not.toContain("Kick");
  });
  it("totals only visible platform observations in the tooltip and leaves empty series empty", () => {
    const tooltip = buildGameChartOption(series, "viewers").tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([
      {
        seriesName: "Twitch",
        value: [Date.parse(slots[0]!), 100],
        color: "#7C3AD1",
      },
      {
        seriesName: "Kick",
        value: [Date.parse(slots[0]!), 20],
        color: "#34821B",
      },
    ]);
    expect(html).toContain("Total");
    expect(html).toContain("120");
    expect(
      buildGameChartOption({ slots: [], viewers: {}, channels: {} }, "viewers")
        .series,
    ).toEqual([]);
  });
});
