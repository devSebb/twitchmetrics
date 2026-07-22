import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@twitchmetrics/database";
import {
  DISCOVERABLE_CREATOR_SQL,
  DISCOVERABLE_CREATOR_WHERE,
  LOOKUP_CREATOR_SQL,
  LOOKUP_CREATOR_WHERE,
  creatorRobots,
  listedAfterMerge,
  resolveCreatorSlug,
} from "./creator-visibility";

describe("creator visibility policies", () => {
  it("limits discovery to listed canonical profiles", () => {
    expect(DISCOVERABLE_CREATOR_WHERE).toEqual({
      listed: true,
      mergedIntoId: null,
    });
    expect(DISCOVERABLE_CREATOR_SQL.sql).toContain('cp."listed" = true');
    expect(DISCOVERABLE_CREATOR_SQL.sql).toContain('cp."mergedIntoId" IS NULL');
  });

  it("keeps unlisted canonical profiles available to lookup", () => {
    expect(LOOKUP_CREATOR_WHERE).toEqual({ mergedIntoId: null });
    expect(LOOKUP_CREATOR_SQL.sql).not.toContain('cp."listed"');
    expect(LOOKUP_CREATOR_SQL.sql).toContain('cp."mergedIntoId" IS NULL');
  });

  it("preserves listing when either side of a merge was listed", () => {
    expect(listedAfterMerge(false, false)).toBe(false);
    expect(listedAfterMerge(true, false)).toBe(true);
    expect(listedAfterMerge(false, true)).toBe(true);
    expect(listedAfterMerge(true, true)).toBe(true);
  });

  it("allows direct access but prevents unlisted profiles from being indexed", () => {
    expect(creatorRobots(true)).toEqual({ index: true, follow: true });
    expect(creatorRobots(false)).toEqual({ index: false, follow: true });
  });

  it("resolves a merge stub to its canonical creator", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "stub-id",
      slug: "old-slug",
      listed: false,
      mergedInto: {
        id: "canonical-id",
        slug: "canonical-slug",
        listed: true,
      },
    });
    const prisma = {
      creatorProfile: { findUnique },
    } as unknown as PrismaClient;

    await expect(resolveCreatorSlug(prisma, "old-slug")).resolves.toEqual({
      found: true,
      id: "canonical-id",
      listed: true,
      canonicalSlug: "canonical-slug",
      redirect: true,
    });
  });

  it("returns a canonical profile without redirecting", async () => {
    const prisma = {
      creatorProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: "creator-id",
          slug: "creator-slug",
          listed: false,
          mergedInto: null,
        }),
      },
    } as unknown as PrismaClient;

    await expect(resolveCreatorSlug(prisma, "creator-slug")).resolves.toEqual({
      found: true,
      id: "creator-id",
      listed: false,
      canonicalSlug: "creator-slug",
      redirect: false,
    });
  });
});
