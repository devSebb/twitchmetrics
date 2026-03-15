import type { Platform } from "@twitchmetrics/database";
import type { PlatformAdapter } from "./types";
import { twitchAdapter } from "./twitch";
import { youtubeAdapter } from "./youtube";
import { instagramAdapter } from "./instagram";
import { tiktokAdapter } from "./tiktok";
import { xAdapter } from "./x";

const ADAPTER_MAP: Partial<Record<Platform, PlatformAdapter>> = {
  twitch: twitchAdapter,
  youtube: youtubeAdapter,
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  x: xAdapter,
};

/**
 * Returns the adapter for a given platform, or null if not yet implemented.
 * All workers and services should use this instead of importing specific adapters.
 */
export function getAdapter(platform: Platform): PlatformAdapter | null {
  return ADAPTER_MAP[platform] ?? null;
}

/**
 * Returns all currently active adapters (non-null entries).
 */
export function getActiveAdapters(): PlatformAdapter[] {
  return Object.values(ADAPTER_MAP).filter(
    (a): a is PlatformAdapter => a != null,
  );
}

// Re-export types for convenience
export { type PlatformAdapter, AdapterError } from "./types";
export type {
  CreatorProfileData,
  CreatorSnapshotData,
  SearchResult,
  GameSnapshotData,
} from "./types";
