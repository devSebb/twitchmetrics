import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { renderRosterPdf } from "./render";
import type { RosterReportProps } from "./roster-report";

// No network images or real account data. Exercises static font embedding,
// long identities, non-ASCII names, sparse metrics and multi-page pagination.
export const rosterFixture: RosterReportProps = {
  manager: {
    displayName: "Avery Example",
    agencyName: "Example International Creator Management & Representation",
    bio: "Fictional roster for layout verification. Independent creators across gaming, music and live entertainment.",
    avatarUrl: null,
  },
  brandColor: "#305E49",
  generatedAt: new Date("2026-11-23T12:00:00Z"),
  summary: { totalCreators: 7, totalFollowers: 8750000, avgGrowthPct: 4.2 },
  creators: Array.from({ length: 7 }, (_, i) => ({
    slug: `example-${i}`,
    displayName: [
      "A Very Long Example Creator Display Name",
      "Мария Example",
      "Élodie Example",
      "Sparse profile",
      "Nova Example",
      "Alex Example",
      "River Example",
    ][i]!,
    avatarUrl: null,
    primaryPlatform: "twitch",
    primaryUsername: `example${i}`,
    totalFollowers: 1250000,
    growth7dPct: i === 3 ? null : i === 2 ? -1.2 : 4.2,
    topGame: i === 3 ? null : "Example Game: A Long Category Title",
    platformBreakdown:
      i === 3
        ? []
        : ["twitch", "youtube", "kick", "x", "instagram", "tiktok"].map(
            (platform) => ({
              platform: platform as "twitch",
              username: `example${i}`,
              followerCount: 250000,
            }),
          ),
    profileUrl: `https://example.test/creators/example-${i}`,
  })),
  siteUrl: "https://example.test",
};

it("renders the roster with local Noticed fonts and keeps the supplied data intact", async () => {
  const before = structuredClone(rosterFixture);
  const pdf = await renderRosterPdf(rosterFixture);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(10000);
  for (const face of ["Regular", "Medium", "Bold", "ExtraBold"]) {
    expect(pdf.toString("latin1")).toContain(`GolosText-${face}`);
  }
  expect(rosterFixture).toEqual(before);
  if (process.env.NOTICED_PDF_REVIEW_PATH)
    await writeFile(process.env.NOTICED_PDF_REVIEW_PATH, pdf);
}, 15000);
