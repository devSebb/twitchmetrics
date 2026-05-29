import { describe, expect, it } from "vitest";
import { parseOAuthScopes } from "./platform-connection";

describe("parseOAuthScopes", () => {
  it("parses space-separated OAuth scopes", () => {
    expect(parseOAuthScopes("openid email profile")).toEqual([
      "openid",
      "email",
      "profile",
    ]);
  });

  it("parses TikTok comma-separated OAuth scopes", () => {
    expect(
      parseOAuthScopes("user.info.basic,user.info.profile,video.list"),
    ).toEqual(["user.info.basic", "user.info.profile", "video.list"]);
  });

  it("ignores repeated delimiters and blank values", () => {
    expect(parseOAuthScopes(" user.info.basic,  video.list ")).toEqual([
      "user.info.basic",
      "video.list",
    ]);
  });
});
