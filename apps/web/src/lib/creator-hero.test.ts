import { describe, expect, it } from "vitest";
import {
  buildCreatorHero,
  countryLabel,
  languageLabel,
  lastStreamedLabel,
  nameSizeFor,
  type CreatorHeroData,
} from "./creator-hero";

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
    primaryPlatform: "youtube",
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

const NOW = new Date("2026-11-24T12:00:00Z");

describe("platform cells", () => {
  it("orders by audience, largest first, whatever order the accounts arrive in", () => {
    const hero = buildCreatorHero(
      creator([
        ["twitch", "ninja", "19200000"],
        ["x", "Ninja", "6700000"],
        ["youtube", "Ninja", "23400000"],
        ["tiktok", "ninja", "11000000"],
        ["instagram", "ninja", "11400000"],
      ]),
    );
    expect(hero.mode).toBe("multi");
    expect(hero.cells.map((cell) => cell.platform)).toEqual([
      "youtube",
      "twitch",
      "instagram",
      "tiktok",
      "x",
    ]);
    expect(hero.cells.map((cell) => cell.display)).toEqual([
      "23.4M",
      "19.2M",
      "11.4M",
      "11M",
      "6.7M",
    ]);
    expect(hero.cells.map((cell) => cell.share)).toEqual([
      "32.6%",
      "26.8%",
      "15.9%",
      "15.3%",
      "9.3%",
    ]);
    expect(hero.total).toBe("71.7M");
    expect(hero.totalLabel).toBe("Total audience");
  });

  it("breaks ties with the canonical platform order and puts uncounted platforms last", () => {
    const hero = buildCreatorHero(
      creator([
        ["kick", "sample", null],
        ["x", "sample", "500"],
        ["twitch", "sample", "500"],
        ["youtube", "sample", null],
      ]),
    );
    expect(hero.cells.map((cell) => cell.platform)).toEqual([
      "twitch",
      "x",
      "youtube",
      "kick",
    ]);
  });

  it("keeps an uncounted platform visible with a dash and no share or bar", () => {
    const hero = buildCreatorHero(
      creator([
        ["twitch", "sample", "900"],
        ["kick", "sample", null],
      ]),
    );
    const kick = hero.cells[1]!;
    expect(kick).toMatchObject({
      platform: "kick",
      display: "—",
      missing: true,
      share: null,
      barPct: null,
    });
    expect(hero.cells[0]).toMatchObject({ share: "100.0%", barPct: 100 });
    expect(hero.total).toBe("900");
  });

  it("gives a platform under a tenth of a percent a readable share and a visible bar", () => {
    const hero = buildCreatorHero(
      creator([
        ["youtube", "big", "7790000"],
        ["x", "small", "3000"],
      ]),
    );
    expect(hero.cells[1]).toMatchObject({ share: "<0.1%", barPct: 2 });
    expect(hero.cells[0]!.barPct).toBe(100);
  });

  it("shows a channel title as written and prefixes real handles with @", () => {
    const hero = buildCreatorHero(
      creator([
        ["youtube", "Star Wars Theory", "3488600"],
        ["instagram", "star.wars.theory", "419641"],
        ["x", "@already", "10"],
      ]),
    );
    expect(hero.cells.map((cell) => cell.handle)).toEqual([
      "Star Wars Theory",
      "@star.wars.theory",
      "@already",
    ]);
    // A YouTube title cannot be turned into a channel address.
    expect(hero.cells[0]!.href).toBeNull();
    expect(hero.cells[1]!.href).toContain("instagram.com/star.wars.theory");
    expect(hero.cells[0]!.unit).toBe("Subscribers");
    expect(hero.cells[1]!.unit).toBe("Followers");
  });
});

describe("headline", () => {
  it("names the platform when it is the creator's only one", () => {
    const hero = buildCreatorHero(
      creator([["youtube", "Simón Super Conejo [Español Latino]", "3690000"]]),
    );
    expect(hero.mode).toBe("single");
    expect(hero.totalLabel).toBe("YouTube subscribers");
    expect(hero.total).toBe("3.7M");
    expect(buildCreatorHero(creator([["twitch", "a", "12"]])).totalLabel).toBe(
      "Twitch followers",
    );
  });

  it("shows a dash rather than zero when no platform publishes a count", () => {
    expect(buildCreatorHero(creator([["kick", "a", null]])).total).toBe("—");
    expect(
      buildCreatorHero(
        creator([
          ["kick", "a", null],
          ["youtube", "b", null],
        ]),
      ).total,
    ).toBe("—");
  });

  it("uses the stored total, which is the figure the rest of the site reports", () => {
    const hero = buildCreatorHero(
      creator(
        [
          ["twitch", "a", "100"],
          ["youtube", "b", "100"],
        ],
        { totalFollowers: "250" },
      ),
    );
    expect(hero.total).toBe("250");
    expect(hero.cells.map((cell) => cell.share)).toEqual(["50.0%", "50.0%"]);
  });

  it("has no cells for a profile without accounts", () => {
    const hero = buildCreatorHero(creator([]));
    expect(hero.mode).toBe("none");
    expect(hero.cells).toEqual([]);
  });
});

describe("name size", () => {
  it("steps down as the name gets longer and counts emoji as one character", () => {
    expect(nameSizeFor("a".repeat(8))).toBe("xl");
    expect(nameSizeFor("a".repeat(9))).toBe("lg");
    expect(nameSizeFor("a".repeat(16))).toBe("lg");
    expect(nameSizeFor("a".repeat(17))).toBe("md");
    expect(nameSizeFor("a".repeat(28))).toBe("md");
    expect(nameSizeFor("a".repeat(29))).toBe("sm");
    expect(nameSizeFor("🦊".repeat(8))).toBe("xl");
    expect(nameSizeFor("TV CRUZEIRO | Cruzeiro Esporte Clube")).toBe("sm");
  });

  it("drops one step on the owner dashboard and never goes below the smallest", () => {
    expect(nameSizeFor("Ninja", true)).toBe("lg");
    expect(nameSizeFor("a".repeat(40), true)).toBe("sm");
  });
});

describe("meta line", () => {
  it("spells out country and language codes and keeps anything else as stored", () => {
    expect(countryLabel("us")).toBe("United States");
    expect(countryLabel("BR")).toBe("Brazil");
    expect(countryLabel("Narnia")).toBe("Narnia");
    expect(countryLabel("  ")).toBeNull();
    expect(languageLabel("es")).toBe("Spanish");
    expect(languageLabel("Português")).toBe("Português");
    expect(languageLabel(null)).toBeNull();
  });

  it("lists only the facts that exist", () => {
    expect(buildCreatorHero(creator([])).meta).toEqual([]);
    expect(
      buildCreatorHero(
        creator([], {
          country: "MX",
          primaryGameName: "Film & Animation",
          language: "es",
          age: 35,
        }),
      ).meta,
    ).toEqual(["Mexico", "Film & Animation", "Spanish", "35 years old"]);
    expect(
      buildCreatorHero(creator([], { primaryGameName: "Sports" })).meta,
    ).toEqual(["Sports"]);
  });

  it("describes the last stream relative to today, then by month", () => {
    expect(lastStreamedLabel(null, NOW)).toBeNull();
    expect(lastStreamedLabel("not a date", NOW)).toBeNull();
    expect(lastStreamedLabel("2026-11-24T01:00:00Z", NOW)).toBe(
      "Streamed today",
    );
    expect(lastStreamedLabel("2026-11-23T23:00:00Z", NOW)).toBe(
      "Last streamed yesterday",
    );
    expect(lastStreamedLabel("2026-11-21T08:00:00Z", NOW)).toBe(
      "Last streamed 3d ago",
    );
    expect(lastStreamedLabel("2026-08-02T08:00:00Z", NOW)).toBe(
      "Last streamed Aug 2026",
    );
    expect(
      buildCreatorHero(creator([], { lastStreamAt: "2026-11-21T08:00:00Z" }), {
        now: NOW,
      }).lastStreamed,
    ).toBe("Last streamed 3d ago");
  });
});

describe("bio preview", () => {
  it("is absent when there is no bio", () => {
    expect(buildCreatorHero(creator([])).bioPreview).toBeNull();
    expect(buildCreatorHero(creator([], { bio: "   " })).bioPreview).toBeNull();
  });

  it("flattens line breaks for the preview and offers the full text when they exist", () => {
    const hero = buildCreatorHero(
      creator([], { bio: "Pro player.\n*Accomplishments*\n- 1st Place" }),
    );
    expect(hero.bioPreview).toBe("Pro player. *Accomplishments* - 1st Place");
    expect(hero.hasFullBio).toBe(true);
  });

  it("offers the full text only past the preview length", () => {
    expect(
      buildCreatorHero(creator([], { bio: "a".repeat(180) })).hasFullBio,
    ).toBe(false);
    expect(
      buildCreatorHero(creator([], { bio: "a".repeat(181) })).hasFullBio,
    ).toBe(true);
  });
});
