import type { Platform } from "@twitchmetrics/database";
import type {
  PlatformAdapter,
  CreatorProfileData,
  CreatorSnapshotData,
  SearchResult,
} from "./types";
import { AdapterError } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("tiktok-adapter");

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

// ============================================================
// TIKTOK API RESPONSE TYPES (for when app is approved)
// ============================================================

type TikTokUserInfoResponse = {
  data: {
    user: {
      open_id: string;
      union_id?: string;
      avatar_url?: string;
      display_name?: string;
      follower_count?: number;
      following_count?: number;
      likes_count?: number;
      video_count?: number;
    };
  };
  error: {
    code: string;
    message: string;
  };
};

// ============================================================
// TIKTOK ADAPTER IMPLEMENTATION
// ============================================================

class TikTokAdapter implements PlatformAdapter {
  readonly platform: Platform = "tiktok";

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    // TikTok API requires app review before access is granted.
    // Username-based lookup is not available via the Login Kit API.
    throw new AdapterError(
      "tiktok",
      "api_error",
      "TikTok adapter pending API review — profile lookup unavailable",
    );
  }

  async fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    if (!options.isOAuthConnected || !options.accessToken) {
      throw new AdapterError(
        "tiktok",
        "auth_expired",
        "TikTok requires OAuth connection for snapshots",
      );
    }

    // When TikTok app is approved, replace this stub with:
    // const res = await fetch(
    //   `${TIKTOK_API_BASE}/user/info/?fields=follower_count,following_count,likes_count,video_count`,
    //   { headers: { Authorization: `Bearer ${options.accessToken}` } },
    // );
    // const data: TikTokUserInfoResponse = await res.json();

    log.warn(
      { platformUserId },
      "TikTok adapter pending API review — returning stub snapshot",
    );

    return {
      platform: "tiktok",
      platformUserId,
      snapshotAt: new Date(),
      followerCount: null,
      followingCount: null,
      totalViews: null,
      subscriberCount: null,
      postCount: null,
      extendedMetrics: {},
    };
  }

  async search(_query: string, _limit?: number): Promise<SearchResult[]> {
    // TikTok API does not expose a public search endpoint
    return [];
  }
}

export const tiktokAdapter = new TikTokAdapter();
