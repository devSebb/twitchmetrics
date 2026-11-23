"use client";

import { createContext, useContext, type ReactNode } from "react";
import { NOTICED, NOTICED_CHART_COLORS } from "@/lib/constants/noticed";
import { THEME } from "@/lib/constants/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";

export type Appearance = "legacy" | "noticed";
const AppearanceContext = createContext<Appearance>("legacy");

export function AppearanceProvider({
  children,
  appearance = "noticed",
}: {
  children: ReactNode;
  appearance?: Appearance;
}) {
  return (
    <AppearanceContext.Provider value={appearance}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}

const legacyChartPalette = {
  ink: THEME.colors.textHeader,
  muted: THEME.colors.textMuted,
  success: THEME.colors.success,
  error: THEME.colors.error,
  platforms: Object.fromEntries(
    Object.entries(PLATFORM_CONFIG).map(([key, config]) => [key, config.color]),
  ) as typeof NOTICED_CHART_COLORS,
};
const noticedChartPalette = {
  ink: NOTICED.ink,
  muted: NOTICED.slate,
  success: NOTICED.success,
  error: NOTICED.error,
  platforms: NOTICED_CHART_COLORS,
};

/** Resolved canvas colours; no metric or series transformations. */
export function useChartPalette() {
  return useAppearance() === "noticed"
    ? noticedChartPalette
    : legacyChartPalette;
}
