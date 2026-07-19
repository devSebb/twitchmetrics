import { describe, expect, it } from "vitest";
import { getSafePlatformProfileUrl } from "./platform-profile-url";

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
