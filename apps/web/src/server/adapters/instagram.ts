import type { Platform } from "@twitchmetrics/database";
import type {
  PlatformAdapter,
  CreatorProfileData,
  CreatorSnapshotData,
  SearchResult,
} from "./types";
import { AdapterError } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("instagram-adapter");

const GRAPH_API_BASE = "https://graph.instagram.com";

// ============================================================
// INSTAGRAM GRAPH API RESPONSE TYPES
// ============================================================

type InstagramMeResponse = {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
};

// ============================================================
// INSTAGRAM ADAPTER IMPLEMENTATION
// ============================================================

class InstagramAdapter implements PlatformAdapter {
  readonly platform: Platform = "instagram";

  async fetchProfile(platformUsername: string): Promise<CreatorProfileData> {
    // Instagram Graph API does not support username lookup without auth.
    // A user token is required to resolve usernames to profile data.
    throw new AdapterError(
      "instagram",
      "api_error",
      "Instagram adapter not yet approved — profile lookup unavailable",
    );
  }

  async fetchSnapshot(
    platformUserId: string,
    options: { isOAuthConnected: boolean; accessToken?: string },
  ): Promise<CreatorSnapshotData> {
    if (!options.isOAuthConnected || !options.accessToken) {
      throw new AdapterError(
        "instagram",
        "auth_expired",
        "Instagram requires OAuth connection for snapshots",
      );
    }

    // When Meta app is approved, replace this stub with:
    // const res = await fetch(
    //   `${GRAPH_API_BASE}/me?fields=id,username,name,followers_count,follows_count,media_count&access_token=${options.accessToken}`,
    // );
    // const data: InstagramMeResponse = await res.json();

    log.warn(
      { platformUserId },
      "Instagram adapter not approved — returning stub snapshot",
    );

    return {
      platform: "instagram",
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
    // Instagram Graph API does not support search
    return [];
  }
}

export const instagramAdapter = new InstagramAdapter();
