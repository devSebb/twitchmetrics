import * as echarts from "echarts/core";
import { THEME } from "@/lib/constants/theme";

const themeConfig: Record<string, unknown> = {
  color: [
    "#9146ff", // Twitch
    "#ff0000", // YouTube
    "#e4405f", // Instagram
    "#69C9D0", // TikTok
    "#1DA1F2", // X
    "#53fc18", // Kick
  ],
  backgroundColor: "transparent",
  textStyle: {
    color: THEME.colors.text,
    fontFamily: THEME.fontFamily.body,
  },
  title: {
    textStyle: {
      color: THEME.colors.textHeader,
      fontFamily: THEME.fontFamily.body,
    },
    subtextStyle: {
      color: THEME.colors.textMuted,
    },
  },
  line: {
    itemStyle: { borderWidth: 2 },
    lineStyle: { width: 2 },
    symbolSize: 4,
    symbol: "circle",
    smooth: true,
  },
  categoryAxis: {
    axisLine: { show: true, lineStyle: { color: THEME.colors.border } },
    axisTick: { show: false },
    axisLabel: { color: THEME.colors.textMuted, fontSize: 12 },
    splitLine: {
      show: true,
      lineStyle: { color: THEME.colors.background, opacity: 0.5 },
    },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: THEME.colors.textMuted, fontSize: 12 },
    splitLine: {
      show: true,
      lineStyle: { color: THEME.colors.background, opacity: 0.5 },
    },
  },
  tooltip: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    textStyle: {
      color: THEME.colors.text,
      fontSize: 13,
    },
    extraCssText: "border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);",
  },
  legend: {
    textStyle: { color: THEME.colors.textMuted },
  },
  dataZoom: [
    {
      type: "slider",
      backgroundColor: THEME.colors.surfaceElevated,
      borderColor: THEME.colors.border,
      fillerColor: "rgba(145, 70, 255, 0.15)",
      handleStyle: { color: THEME.colors.borderHover },
      textStyle: { color: THEME.colors.textMuted },
      dataBackground: {
        lineStyle: { color: THEME.colors.border },
        areaStyle: { color: THEME.colors.border, opacity: 0.2 },
      },
    },
  ],
  markPoint: {
    label: {
      color: THEME.colors.text,
    },
  },
  markLine: {
    lineStyle: {
      color: THEME.colors.textMuted,
    },
    label: {
      color: THEME.colors.textMuted,
    },
  },
};

echarts.registerTheme("twitchmetrics", themeConfig);

/** Platform-specific chart colors */
export const CHART_PLATFORM_COLORS: Record<string, string> = {
  twitch: "#9146ff",
  youtube: "#ff0000",
  instagram: "#E4405F",
  tiktok: "#69C9D0",
  x: "#1DA1F2",
  kick: "#53fc18",
};

/** Trend-based colors for sparklines and indicators */
export const CHART_TREND_COLORS = {
  up: THEME.colors.success,
  down: THEME.colors.error,
  flat: THEME.colors.textMuted,
} as const;
