import { describe, expect, it } from "vitest";
import { upsertStreamSessionFacts, type StreamFactInput } from "./facts";

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
