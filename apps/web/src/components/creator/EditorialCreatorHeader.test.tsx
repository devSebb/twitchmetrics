import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CreatorHeroData } from "@/lib/creator-hero";
import { EditorialCreatorHeader } from "./EditorialCreatorHeader";

type Account = [platform: string, username: string, followers: string | null];

function creator(
  accounts: Account[],
  overrides: Partial<CreatorHeroData> = {},
): CreatorHeroData {
  const total = accounts.reduce((sum, a) => sum + Number(a[2] ?? 0), 0);
  return {
    id: "creator-1",
    displayName: "Sample",
    slug: "sample",
    avatarUrl: null,
    bannerUrl: null,
    bio: null,
    country: null,
    language: null,
    age: null,
    state: "unclaimed",
    primaryPlatform: "twitch",
    totalFollowers: String(total),
    lastSnapshotAt: null,
    primaryGameName: null,
    lastStreamAt: null,
    growthRollups: [],
    platformAccounts: accounts.map(([platform, platformUsername, count]) => ({
      platform,
      platformUsername,
      platformUrl: null,
      followerCount: count,
      totalViews: null,
      postCount: null,
    })),
    ...overrides,
  } as CreatorHeroData;
}

const render = (
  data: CreatorHeroData,
  props: { kit?: boolean; owner?: boolean; actions?: React.ReactNode } = {},
) => renderToStaticMarkup(<EditorialCreatorHeader creator={data} {...props} />);

const MULTI: Account[] = [
  ["twitch", "sample", "600"],
  ["instagram", "sample.ig", "400"],
];

describe("EditorialCreatorHeader", () => {
  it("shows a total and one linked cell per platform, largest first", () => {
    const html = render(creator(MULTI));
    expect(html).toContain("Total audience");
    expect(html).toContain("60.0%");
    expect(html).toContain("40.0%");
    expect(html.indexOf("Twitch")).toBeLessThan(html.indexOf("Instagram"));
    expect(html).toContain('href="https://twitch.tv/sample"');
    expect(html).toContain("Not a unique audience count");
  });

  it("turns a single platform into the headline, with no total, share or disclaimer", () => {
    const html = render(creator([["twitch", "sample", "1200"]]));
    expect(html).toContain("Twitch followers");
    expect(html).toContain("1.2K");
    expect(html).toContain("@sample");
    expect(html).not.toContain("Total audience");
    expect(html).not.toMatch(/\d%</);
    expect(html).not.toContain("Not a unique audience count");
  });

  it("keeps a platform without a public count, marked as such", () => {
    const html = render(
      creator([
        ["twitch", "sample", "600"],
        ["kick", "sample", null],
      ]),
    );
    expect(html).toContain("Kick");
    expect(html).toContain("—");
    expect(html).toContain("Count not public");
  });

  it("does not link a platform whose address cannot be built", () => {
    const html = render(
      creator([
        ["youtube", "Sample Channel Title", "600"],
        ["twitch", "sample", "400"],
      ]),
    );
    expect(html).toContain("External profile unavailable");
    expect(html).not.toContain("youtube.com");
  });

  it("renders no platform strip for a profile without accounts", () => {
    const html = render(creator([]));
    expect(html).not.toContain("Total audience");
    expect(html).toContain("Open the shareable media kit");
  });

  it("leaves out the bio block when there is no bio", () => {
    const html = render(creator(MULTI));
    expect(html).not.toContain("Read full bio");
    expect(html).not.toContain('role="dialog"');
  });

  it("shows a short bio in full without a panel", () => {
    const html = render(creator(MULTI, { bio: "Short and sweet." }));
    expect(html).toContain("Short and sweet.");
    expect(html).not.toContain("Read full bio");
  });

  it("keeps the whole of a long bio in the markup behind the closed panel", () => {
    const bio = `Opening line.\n${"More about the creator. ".repeat(12)}The very last words.`;
    const html = render(creator(MULTI, { bio }));
    expect(html).toContain("Read full bio");
    expect(html).toContain("About Sample");
    expect(html).toContain("The very last words.");
    expect(html).toMatch(/data-bio-panel[^>]*class="hidden"/);
  });

  it("builds the meta line from the facts that exist", () => {
    expect(render(creator(MULTI))).not.toContain("United States");
    const html = render(
      creator(MULTI, { country: "US", primaryGameName: "Fortnite" }),
    );
    expect(html).toContain("United States");
    expect(html).toContain("Fortnite");
  });

  it("reflects who manages the profile", () => {
    expect(render(creator(MULTI))).toContain("/claim?profile=creator-1");
    expect(render(creator(MULTI, { state: "pending_claim" }))).toContain(
      "Claim pending",
    );
    expect(render(creator(MULTI, { state: "claimed" }))).toContain(
      "Managed by the creator",
    );
    expect(render(creator(MULTI, { state: "premium" }))).toContain(
      "Premium profile",
    );
  });

  it("drops the claim status on the owner dashboard", () => {
    const html = render(creator(MULTI), { owner: true });
    expect(html).not.toContain("Claim this profile");
    expect(html).toContain("Total audience");
  });

  it("switches labels and the cross-link on the media kit and keeps its actions", () => {
    const html = render(creator(MULTI), {
      kit: true,
      actions: <button>Copy media-kit link</button>,
    });
    expect(html).toContain("Creator media kit");
    expect(html).toContain("Explore the full analytics profile");
    expect(html).toContain('href="/creator/sample"');
    expect(html).toContain("Copy media-kit link");
  });
});
