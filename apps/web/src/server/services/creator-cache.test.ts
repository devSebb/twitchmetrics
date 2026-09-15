import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheInvalidate = vi.fn(async (_pattern: string) => 1);
vi.mock("@/server/services/cache", () => ({ cacheInvalidate }));

const {
  creatorDetailCacheKey,
  creatorSnapshotsCacheKey,
  invalidateCreatorCache,
} = await import("./creator-cache");

function globMatches(pattern: string, key: string): boolean {
  const regex = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );
  return regex.test(key);
}

describe("invalidateCreatorCache", () => {
  beforeEach(() => cacheInvalidate.mockClear());

  it("deletes the exact detail key the API route writes", async () => {
    await invalidateCreatorCache("ninja");
    expect(cacheInvalidate).toHaveBeenCalledWith(
      creatorDetailCacheKey("ninja"),
    );
  });

  it("uses a pattern that matches every snapshots key for the creator only", async () => {
    await invalidateCreatorCache("ninja");
    const patterns = cacheInvalidate.mock.calls.map(([p]) => p);
    const key = creatorSnapshotsCacheKey("ninja", "all", "followers", "30d");
    const otherCreator = creatorSnapshotsCacheKey(
      "ninja2",
      "all",
      "followers",
      "30d",
    );
    expect(patterns.some((p) => globMatches(p, key))).toBe(true);
    expect(patterns.some((p) => globMatches(p, otherCreator))).toBe(false);
  });
});
