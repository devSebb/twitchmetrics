import { cacheInvalidate } from "@/server/services/cache";

// Single source for public creator API cache keys. Writers (the API routes)
// and invalidators (snapshot jobs) must both build keys here, otherwise a
// version bump on one side silently stops invalidation on the other.
// Bump a version to expire every cached entry of that shape.

const DETAIL_PREFIX = "creator:v4";
const SNAPSHOTS_PREFIX = "creator:v2";

export function creatorDetailCacheKey(slug: string): string {
  return `${DETAIL_PREFIX}:${slug}`;
}

export function creatorSnapshotsCacheKey(
  slug: string,
  platform: string,
  metric: string,
  period: string,
): string {
  return `${SNAPSHOTS_PREFIX}:${slug}:snapshots:${platform}:${metric}:${period}`;
}

/** Drop every cached public API response for one creator. */
export async function invalidateCreatorCache(slug: string): Promise<void> {
  await cacheInvalidate(creatorDetailCacheKey(slug));
  await cacheInvalidate(`${SNAPSHOTS_PREFIX}:${slug}:snapshots:*`);
}
