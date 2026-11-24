"use client";

import { createContext, useContext, type ReactNode } from "react";
import { NOTICED, NOTICED_CHART_COLORS } from "@/lib/constants/noticed";

export type Appearance = "noticed";
const AppearanceContext = createContext<Appearance>("noticed");

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

const noticedChartPalette = {
  ink: NOTICED.ink,
  muted: NOTICED.slate,
  success: NOTICED.success,
  error: NOTICED.error,
  platforms: NOTICED_CHART_COLORS,
};

/** Resolved canvas colours; no metric or series transformations. */
export function useChartPalette() {
  return noticedChartPalette;
}
