import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (vi.hoisted: vi.mock factories run before module-level consts) ---
const { queryRaw, findMany, cacheGet, cacheSet } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findMany: vi.fn(async () => []),
  cacheGet: vi.fn(async (_key: string) => null as unknown),
  cacheSet: vi.fn(
    async (_key: string, _value: unknown, _ttlSeconds?: number) => undefined,
  ),
}));
vi.mock("@/server/db", () => ({
  db: { $queryRaw: queryRaw, creatorProfile: { findMany } },
}));
vi.mock("@/server/services/cache", () => ({
  cacheGet,
  cacheSet,
  CACHE_TTL: { CREATOR_LIST: 120, CREATOR_TOTAL: 3600 },
}));

import {
  listPublicCreators,
  ListOffsetOutOfRangeError,
  maxListPage,
  MAX_LIST_OFFSET,
  type CreatorListParams,
} from "./creator-list";

const params = (overrides: Partial<CreatorListParams> = {}) =>
  ({
    page: 1,
    limit: 32,
    sort: "followers",
    platform: null,
    game: null,
    query: null,
    view: "grid",
    ...overrides,
  }) satisfies CreatorListParams;

/** $queryRaw serves the id query then the count query, in call order. */
function mockQueries({ ids = [], total }: { ids?: string[]; total: number }) {
  queryRaw.mockReset();
  queryRaw.mockImplementation((sql: { strings?: string[]; sql?: string }) => {
    const text = String(sql?.sql ?? sql?.strings?.join("") ?? "");
    if (text.includes("COUNT(*)"))
      return Promise.resolve([{ total: BigInt(total) }]);
    return Promise.resolve(ids.map((id) => ({ id })));
  });
}

beforeEach(() => {
  cacheGet.mockReset();
  cacheGet.mockResolvedValue(null);
  cacheSet.mockReset();
  findMany.mockClear();
});

describe("total count caching", () => {
  it("skips the COUNT query when the total key is warm", async () => {
    mockQueries({ total: 593_000 });
    cacheGet.mockImplementation(async (key: string) =>
      key.startsWith("creators:total:") ? 593_000 : null,
    );

    const result = await listPublicCreators(params({ page: 40 }));

    expect(result.meta.total).toBe(593_000);
    const countCalls = queryRaw.mock.calls.filter(([sql]) =>
      String(sql?.sql ?? "").includes("COUNT(*)"),
    );
    expect(countCalls).toHaveLength(0);
  });

  it("runs the COUNT query on a cold key and caches it as a number", async () => {
    mockQueries({ total: 593_000 });

    await listPublicCreators(params({ page: 40 }));

    expect(cacheSet).toHaveBeenCalledWith(
      "creators:total:v1:all",
      593_000,
      3600,
    );
    const [, value] = cacheSet.mock.calls.find(([key]) =>
      String(key).startsWith("creators:total:"),
    )!;
    expect(typeof value).toBe("number");
  });

  it("keys the total per platform", async () => {
    mockQueries({ total: 42 });
    await listPublicCreators(params({ platform: "twitch" }));
    expect(cacheGet).toHaveBeenCalledWith("creators:total:v1:twitch");
  });

  it("never caches a filtered total", async () => {
    mockQueries({ total: 7 });
    await listPublicCreators(params({ query: "ninja" }));

    expect(
      cacheGet.mock.calls.filter(([key]) =>
        String(key).startsWith("creators:total:"),
      ),
    ).toHaveLength(0);
    expect(
      cacheSet.mock.calls.filter(([key]) =>
        String(key).startsWith("creators:total:"),
      ),
    ).toHaveLength(0);
    expect(
      queryRaw.mock.calls.filter(([sql]) =>
        String(sql?.sql ?? "").includes("COUNT(*)"),
      ),
    ).toHaveLength(1);
  });
});

describe("deep pagination cap", () => {
  it("serves the last page within the cap", async () => {
    mockQueries({ total: 593_000 });
    await expect(listPublicCreators(params({ page: 500 }))).resolves.toEqual(
      expect.objectContaining({ data: [] }),
    );
  });

  it("rejects the first page past the cap, for any limit", async () => {
    mockQueries({ total: 593_000 });
    await expect(listPublicCreators(params({ page: 501 }))).rejects.toThrow(
      ListOffsetOutOfRangeError,
    );
    await expect(
      listPublicCreators(params({ page: 161, limit: 100 })),
    ).rejects.toThrow(ListOffsetOutOfRangeError);
    expect(maxListPage(32)).toBe(500);
    expect(maxListPage(100)).toBe(MAX_LIST_OFFSET / 100);
  });

  it("clamps totalPages so the grid cannot link past the cap", async () => {
    mockQueries({ total: 593_000 });
    const result = await listPublicCreators(params({ page: 500 }));
    expect(result.meta.totalPages).toBe(500);
    expect(result.meta.hasMore).toBe(false);
  });

  it("leaves totalPages alone for a short list", async () => {
    mockQueries({ total: 100 });
    const result = await listPublicCreators(params());
    expect(result.meta.totalPages).toBe(4);
    expect(result.meta.hasMore).toBe(true);
  });
});
