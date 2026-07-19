import * as echarts from "echarts/core";
import type { Platform } from "@twitchmetrics/database";
import { THEME } from "@/lib/constants/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";

const themeConfig: Record<string, unknown> = {
  color: [
    PLATFORM_CONFIG.twitch.color,
    PLATFORM_CONFIG.youtube.color,
    PLATFORM_CONFIG.instagram.color,
    PLATFORM_CONFIG.tiktok.color,
    PLATFORM_CONFIG.x.color,
    PLATFORM_CONFIG.kick.color,
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
export const CHART_PLATFORM_COLORS: Record<Platform, string> = {
  twitch: PLATFORM_CONFIG.twitch.color,
  youtube: PLATFORM_CONFIG.youtube.color,
  instagram: PLATFORM_CONFIG.instagram.color,
  tiktok: PLATFORM_CONFIG.tiktok.color,
  x: PLATFORM_CONFIG.x.color,
  kick: PLATFORM_CONFIG.kick.color,
};

/** Trend-based colors for sparklines and indicators */
export const CHART_TREND_COLORS = {
  up: THEME.colors.success,
  down: THEME.colors.error,
  flat: THEME.colors.textMuted,
} as const;
