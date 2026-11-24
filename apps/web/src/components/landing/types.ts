import type { Platform } from "@/lib/constants/platforms";

export type LandingCreator = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  primaryPlatform: Platform;
  platformAccounts: { platform: Platform; platformUsername: string }[];
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
};
export type LandingGame = {
  name: string;
  slug: string;
  coverImageUrl: string | null;
  currentViewers: number;
  currentChannels: number;
};
