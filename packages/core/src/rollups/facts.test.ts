import { describe, expect, it } from "vitest";
import {
  batchByIdentity,
  upsertStreamSessionFacts,
  type StreamFactInput,
} from "./facts";

/**
 * Guards the hand-written INSERT in facts.ts.
 *
 * The statement lists its columns and its VALUES tuple separately, so the two
 * can drift. They did: `updatedAt` is NOT NULL with no database default
 * (Prisma applies `@updatedAt` in the client, which a raw query bypasses), it
 * was missing from both lists, and every batch holding a new row failed with
 * 23502. Because a failed batch is caught per date, the 2026-09-21 import
 * reported success having written nothing at all.
 */

function captureSql() {
  const statements: string[] = [];
  const db = {
    $queryRaw: async (query: { text: string }) => {
      statements.push(query.text);
      return [];
    },
  } as never;
  return { statements, db };
}

function fact(): StreamFactInput {
  return {
    source: "streamhatchet",
    sourceObjectId: "3fee2778-60df-49b0-a58e-44d7106e2df9",
    platform: "yt",
    platformUserId: "UC6Y5LJ6df0rmrghMLTNQXgQ",
    platformVideoId: "Vra3Lx8W70o",
    platformUsername: "padovani",
    partitionDate: new Date("2026-09-20T00:00:00.000Z"),
    streamBeginsAt: new Date("2026-09-20T16:46:00.000Z"),
    streamEndsAt: new Date("2026-09-20T18:55:00.000Z"),
    airtimeMinutes: 129,
    minutesWatched: BigInt(2315),
    averageViewers: 17.8,
    peakViewers: 21,
    aggregation: "basic",
    rowHash: "1f8030b215f78d2f80c5e462e3c39924",
  } as StreamFactInput;
}

/** Split on commas that are not inside parentheses or brackets. */
function topLevelParts(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function insertLists(statement: string) {
  const columns =
    /INSERT INTO "StreamSessionFact" \(([\s\S]*?)\)\s*VALUES/.exec(statement);
  const values = /VALUES\s*\(([\s\S]*?)\)\s*ON CONFLICT/.exec(statement);
  if (!columns?.[1] || !values?.[1]) {
    throw new Error("could not parse the INSERT statement");
  }
  return {
    columns: topLevelParts(columns[1]).map((c) => c.replaceAll('"', "")),
    values: topLevelParts(values[1]),
  };
}

describe("upsertStreamSessionFacts", () => {
  it("gives every column a value", async () => {
    const { statements, db } = captureSql();
    await upsertStreamSessionFacts(db, [fact()]);

    const { columns, values } = insertLists(statements[0] ?? "");
    expect(values).toHaveLength(columns.length);
  });

  it("sets updatedAt, which has no database default", async () => {
    const { statements, db } = captureSql();
    await upsertStreamSessionFacts(db, [fact()]);

    const { columns, values } = insertLists(statements[0] ?? "");
    const index = columns.indexOf("updatedAt");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(values[index]).toBe("now()");
    // The conflict branch keeps it fresh too.
    expect(statements[0]).toContain('"updatedAt" = now()');
  });
});

/**
 * Postgres rejects an ON CONFLICT DO UPDATE whose VALUES repeat a conflict key
 * (21000). The export produces exactly that: Stream Hatchet emits one row per
 * (stream, category), so a broadcast that switches game appears twice under one
 * video id. Twitch's import failed every day from 2026-09-20 on it.
 */
describe("batchByIdentity", () => {
  const fact = (over: Partial<Record<string, unknown>> = {}): StreamFactInput =>
    ({
      source: "streamhatchet",
      platform: "twitch",
      platformUserId: "chan-1",
      platformVideoId: "vid-1",
      streamBeginsAt: new Date("2026-09-23T10:00:00.000Z"),
      ...over,
    }) as StreamFactInput;

  it("never repeats an identity inside one statement", () => {
    // One stream, two categories — the shape that broke the import.
    const batches = batchByIdentity([
      fact({ primaryGameName: "Just Chatting" }),
      fact({ primaryGameName: "Valorant" }),
    ]);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
    expect(batches[1]).toHaveLength(1);
  });

  it("keeps distinct streams together in one statement", () => {
    const batches = batchByIdentity([
      fact({ platformVideoId: "vid-1" }),
      fact({ platformVideoId: "vid-2" }),
      fact({ platformUserId: "chan-2" }),
    ]);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it("separates kick rows by begin time, which is its identity", () => {
    // No video id: the key falls back to streamBeginsAt.
    const sameStart = [
      fact({ platform: "kick", platformVideoId: null }),
      fact({ platform: "kick", platformVideoId: null }),
    ];
    expect(batchByIdentity(sameStart)).toHaveLength(2);

    const differentStart = [
      fact({ platform: "kick", platformVideoId: null }),
      fact({
        platform: "kick",
        platformVideoId: null,
        streamBeginsAt: new Date("2026-09-23T18:00:00.000Z"),
      }),
    ];
    expect(batchByIdentity(differentStart)).toHaveLength(1);
  });

  it("does not treat a video-id row and a null-video row as the same key", () => {
    const batches = batchByIdentity([
      fact({ platformVideoId: "vid-1" }),
      fact({ platformVideoId: null }),
    ]);
    expect(batches).toHaveLength(1);
  });

  it("respects the statement size limit", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      fact({ platformVideoId: `vid-${i}` }),
    );
    const batches = batchByIdentity(many, 2);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it("orders repeats after their first sighting, so the merge applies", () => {
    const batches = batchByIdentity([
      fact({ primaryGameName: "first" }),
      fact({ primaryGameName: "second" }),
      fact({ primaryGameName: "third" }),
    ]);

    expect(batches).toHaveLength(3);
    expect(
      batches.map(
        (b) => (b[0] as unknown as { primaryGameName: string }).primaryGameName,
      ),
    ).toEqual(["first", "second", "third"]);
  });
});
