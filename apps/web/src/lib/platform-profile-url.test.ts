import { describe, expect, it } from "vitest";
import {
  getSafePlatformProfileUrl,
  normalizePlatformUrlForStorage,
} from "./platform-profile-url";

describe("getSafePlatformProfileUrl", () => {
  it.each([
    ["twitch", "https://twitch.tv/creator"],
    ["youtube", "https://www.youtube.com/@creator"],
    ["instagram", "https://instagram.com/creator"],
    ["tiktok", "https://www.tiktok.com/@creator"],
    ["x", "https://x.com/creator"],
    ["x", "https://twitter.com/creator"],
    ["kick", "https://kick.com/creator"],
  ] as const)("accepts a valid %s profile URL", (platform, url) => {
    expect(getSafePlatformProfileUrl(platform, url)).toBe(url);
  });

  it("rejects missing and malformed values", () => {
    expect(getSafePlatformProfileUrl("twitch", null)).toBeNull();
    expect(getSafePlatformProfileUrl("twitch", "not a URL")).toBeNull();
  });

  it("rejects insecure, credentialed, and non-platform URLs", () => {
    expect(
      getSafePlatformProfileUrl("twitch", "http://twitch.tv/creator"),
    ).toBeNull();
    expect(
      getSafePlatformProfileUrl(
        "twitch",
        "https://user:password@twitch.tv/creator",
      ),
    ).toBeNull();
    expect(
      getSafePlatformProfileUrl("twitch", "https://example.com/creator"),
    ).toBeNull();
    expect(
      getSafePlatformProfileUrl("x", "https://notx.com/creator"),
    ).toBeNull();
  });
});

describe("normalizePlatformUrlForStorage", () => {
  it("keeps already-canonical URLs unchanged", () => {
    expect(
      normalizePlatformUrlForStorage(
        "instagram",
        "https://instagram.com/creator",
      ),
    ).toBe("https://instagram.com/creator");
  });

  it.each([
    ["instagram", "instagram.com/creator", "https://instagram.com/creator"],
    ["tiktok", "www.tiktok.com/@creator", "https://www.tiktok.com/@creator"],
    ["x", "http://twitter.com/creator", "https://twitter.com/creator"],
    ["x", "//x.com/creator", "https://x.com/creator"],
  ] as const)("upgrades raw %s form %s", (platform, raw, expected) => {
    expect(normalizePlatformUrlForStorage(platform, raw)).toBe(expected);
  });

  it("nulls values that cannot be made safe", () => {
    expect(normalizePlatformUrlForStorage("instagram", null)).toBeNull();
    expect(normalizePlatformUrlForStorage("instagram", "   ")).toBeNull();
    expect(normalizePlatformUrlForStorage("instagram", "@creator")).toBeNull();
    expect(
      normalizePlatformUrlForStorage("instagram", "https://evil.com/creator"),
    ).toBeNull();
    expect(normalizePlatformUrlForStorage("x", "notx.com/creator")).toBeNull();
    expect(
      normalizePlatformUrlForStorage(
        "tiktok",
        "https://user:pass@tiktok.com/@creator",
      ),
    ).toBeNull();
  });
});
