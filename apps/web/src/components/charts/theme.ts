import * as echarts from "echarts/core";
import type { Platform } from "@twitchmetrics/database";
import { THEME } from "@/lib/constants/theme";
import { NOTICED, NOTICED_CHART_COLORS } from "@/lib/constants/noticed";

echarts.registerTheme("noticed", {
  color: Object.values(NOTICED_CHART_COLORS),
  backgroundColor: "transparent",
  textStyle: { color: NOTICED.ink, fontFamily: NOTICED.font },
  title: {
    textStyle: {
      color: NOTICED.ink,
      fontFamily: NOTICED.font,
      fontWeight: 700,
    },
    subtextStyle: { color: NOTICED.slate },
  },
  line: { lineStyle: { width: 2 }, symbolSize: 5 },
  categoryAxis: {
    axisLine: { lineStyle: { color: NOTICED.line } },
    axisTick: { show: false },
    axisLabel: { color: NOTICED.slate, fontSize: 12 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: NOTICED.slate, fontSize: 12 },
    splitLine: { lineStyle: { color: NOTICED.line, type: "dashed" } },
  },
  tooltip: {
    backgroundColor: NOTICED.canvas,
    borderColor: NOTICED.control,
    textStyle: { color: NOTICED.ink, fontSize: 14, fontFamily: NOTICED.font },
    extraCssText:
      "border-radius: 6px; box-shadow: 0 8px 24px rgba(21,31,44,.1);",
  },
  legend: { textStyle: { color: NOTICED.slate, fontSize: 14 } },
  dataZoom: {
    backgroundColor: NOTICED.surface,
    borderColor: NOTICED.line,
    fillerColor: "rgba(2,38,88,.12)",
    handleStyle: { color: NOTICED.navy },
    textStyle: { color: NOTICED.slate },
    dataBackground: {
      lineStyle: { color: NOTICED.slate },
      areaStyle: { color: NOTICED.line },
    },
  },
  markLine: {
    lineStyle: { color: NOTICED.slate },
    label: { color: NOTICED.slate },
  },
  markPoint: { label: { color: NOTICED.ink } },
});

/** Platform-specific chart colors */
export const CHART_PLATFORM_COLORS: Record<Platform, string> =
  NOTICED_CHART_COLORS;

/** Trend-based colors for sparklines and indicators */
export const CHART_TREND_COLORS = {
  up: THEME.colors.success,
  down: THEME.colors.error,
  flat: THEME.colors.textMuted,
} as const;
