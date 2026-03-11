import type { Platform } from "@twitchmetrics/database";
import type { MetricKey } from "@/lib/constants/metrics";

export type CreatorProfileData = {
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string;
  platformUrl: string | null;
  platformAvatarUrl: string | null;
  followerCount: bigint | null;
  followingCount: bigint | null;
  totalViews: bigint | null;
  postCount: number | null;
  isLive: boolean | null;
  rawResponse?: unknown;
};

export type CreatorSnapshotData = {
  platform: Platform;
  platformUserId: string;
  snapshotAt: Date;
  followerCount: bigint | null;
  followingCount: bigint | null;
  totalViews: bigint | null;
  subscriberCount: bigint | null;
  postCount: number | null;
  extendedMetrics: Partial<Record<MetricKey, number | bigint | string | null>>;
};

export type GameSnapshotData = {
  platform: Platform;
  platformGameId: string;
  gameName: string;
  snapshotAt: Date;
  viewerCount: number;
  channelCount: number;
};

export type SearchResult = {
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string;
  platformAvatarUrl: string | null;
  followerCount: bigint | null;
  isLive: boolean | null;
};

export interface PlatformAdapter {
  readonly platform: Platform;
  fetchProfile(platformUsername: string): Promise<CreatorProfileData>;
  fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  fetchTopGames?(limit?: number): Promise<GameSnapshotData[]>;
}

export type AdapterErrorCode =
  | "rate_limited"
  | "auth_expired"
  | "not_found"
  | "api_error"
  | "network_error";

export class AdapterError extends Error {
  readonly platform: Platform;
  readonly code: AdapterErrorCode;
  readonly retryable: boolean;

  constructor(
    platform: Platform,
    code: AdapterErrorCode,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "AdapterError";
    this.platform = platform;
    this.code = code;
    this.retryable = retryable;
  }
}
