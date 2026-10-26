import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchChannelsByIds, getQuotaUsed } from "./youtube";
import { AdapterError } from "./types";

function channel(id: string, subs: string | null, hidden = false) {
  return {
    id,
    snippet: {
      title: `Channel ${id}`,
      description: "",
      customUrl: `@${id.toLowerCase()}`,
      thumbnails: { default: { url: `https://img/${id}` } },
    },
    statistics: {
      ...(subs != null ? { subscriberCount: subs } : {}),
      viewCount: "1000",
      videoCount: "12",
      hiddenSubscriberCount: hidden,
    },
  };
}

describe("fetchChannelsByIds", () => {
  beforeEach(() => {
    vi.stubEnv("YOUTUBE_API_KEY", "key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("looks up many ids in one call for 1 quota unit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [channel("UCa", "1500"), channel("UCb", null, true)],
          pageInfo: { totalResults: 2 },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const quotaBefore = getQuotaUsed();

    const out = await fetchChannelsByIds(["UCa", "UCb", "UCgone", "UCa"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get("id")).toBe("UCa,UCb,UCgone");
    expect(url.searchParams.get("part")).toBe("snippet,statistics");
    expect(getQuotaUsed() - quotaBefore).toBe(1);

    expect(out.get("UCa")).toMatchObject({
      subscriberCount: 1500n,
      hiddenSubscriberCount: false,
      customUrl: "@uca",
      videoCount: 12,
    });
    // Hidden count: no number, flagged.
    expect(out.get("UCb")).toMatchObject({
      subscriberCount: null,
      hiddenSubscriberCount: true,
    });
    // Deleted/terminated ids are just absent.
    expect(out.has("UCgone")).toBe(false);
  });

  it("makes no call for an empty list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchChannelsByIds([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects more than 50 ids", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `UC${i}`);
    await expect(fetchChannelsByIds(ids)).rejects.toBeInstanceOf(AdapterError);
  });
});
