import { describe, expect, it } from "vitest";
import type { Prisma } from "@twitchmetrics/database";
import {
  buildRecomputeAggregatesSql,
  recomputeCreatorAggregates,
  recomputeCreatorAggregatesMany,
  type AggregatesDb,
} from "./creator-aggregates";
import { TIER_CONFIG } from "./tiers";

function fakeDb(rowsPerCall = 1) {
  const calls: Prisma.Sql[] = [];
  const db = {
    $executeRaw: (sql: Prisma.Sql) => {
      calls.push(sql);
      return Promise.resolve(rowsPerCall);
    },
  } as unknown as AggregatesDb;
  return { db, calls };
}

describe("buildRecomputeAggregatesSql", () => {
  it("binds tier thresholds from TIER_CONFIG and the id batch as parameters", () => {
    const sql = buildRecomputeAggregatesSql(["a", "b"]);
    expect(sql.values).toEqual([
      TIER_CONFIG.tier1.followerThreshold,
      TIER_CONFIG.tier2.followerThreshold,
      ["a", "b"],
    ]);
  });

  it("totals every account but tiers on tracked accounts only", () => {
    const text = buildRecomputeAggregatesSql(["a"]).sql;
    // The join keeps link-only accounts, so the total matches the header.
    expect(text).not.toMatch(/ON a\."creatorProfileId" = cp\.id AND/);
    expect(text).toContain(
      `COALESCE(SUM(a."followerCount"), 0) AS total_followers`,
    );
    expect(text).toContain(
      `FILTER (WHERE a."discoverySource" IS NULL), 0) AS tracked_followers`,
    );
    expect(text).toContain("WHEN agg.tracked_followers >=");
    expect(text).not.toContain("WHEN agg.total_followers >=");
  });

  it("keeps profiles without accounts", () => {
    const text = buildRecomputeAggregatesSql(["a"]).sql;
    expect(text).toContain("LEFT JOIN");
    expect(text).toContain(`"snapshotTier"`);
    expect(text).toContain(`"lastSnapshotAt"`);
    expect(text).toContain(`"totalViews"`);
  });
});

describe("recomputeCreatorAggregatesMany", () => {
  it("dedupes ids, chunks the batch and sums updated rows", async () => {
    const { db, calls } = fakeDb(2);
    const updated = await recomputeCreatorAggregatesMany(
      ["a", "b", "a", "c", "d", "e"],
      { db, chunk: 2 },
    );
    expect(calls.map((c) => c.values[2])).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(updated).toBe(6);
  });

  it("does nothing for an empty id list", async () => {
    const { db, calls } = fakeDb();
    expect(await recomputeCreatorAggregatesMany([], { db })).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("recomputeCreatorAggregates", () => {
  it("delegates a single profile to the batch path", async () => {
    const { db, calls } = fakeDb();
    await recomputeCreatorAggregates("only", db);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values[2]).toEqual(["only"]);
  });
});
