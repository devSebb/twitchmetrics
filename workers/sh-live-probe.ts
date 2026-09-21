/**
 * C20 spike, step 2 — THROWAWAY. Delete once the questions below are answered.
 *
 * Read-only: three GET requests to StreamHatchet, no database, no writes.
 *
 * It lives in the repo only because it has to run from a GitHub runner. The
 * same calls from a laptop return 401 "Invalid token" with a key that works
 * from Vercel, which points at IP allowlisting — so the first thing this
 * proves is whether a runner's IP is allowed either.
 *
 * Plan B pages the SH /live endpoint for Kick channels and harvests the
 * `followers` field. Three unknowns decide its shape:
 *   1. Does /live accept NO `game`? If yes, page by offset; if no, we must
 *      iterate games, which is far more calls for the same coverage.
 *   2. What is the largest `limit` it honours? That sets pages-per-sweep.
 *   3. What does it say when rate limited (headers / retryAfterSeconds)?
 *
 * Deliberately few calls: the quota is already strained by live-games (C4).
 */
const BASE = "https://api.streamhatchet.com";

function token(): string {
  const value = process.env.STREAMHATCHET_API_KEY;
  if (!value) throw new Error("STREAMHATCHET_API_KEY is not set");
  return value;
}

type LiveChannel = {
  user_id?: string | number;
  username?: string;
  platform?: string;
  followers?: number | null;
  current_viewers?: number | null;
};

async function call(
  label: string,
  params: Record<string, string | number>,
): Promise<LiveChannel[] | null> {
  const url = new URL(`${BASE}/live`);
  url.searchParams.set("token", token());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const started = Date.now();
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const ms = Date.now() - started;

  const shown = new URLSearchParams(url.searchParams);
  shown.set("token", "***");
  console.log(`\n=== ${label} ===`);
  console.log(`GET /live?${shown} -> ${response.status} (${ms} ms)`);

  const interesting: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (/ratelimit|retry|quota|x-rate/i.test(key)) interesting[key] = value;
  });
  console.log("rate-limit headers:", JSON.stringify(interesting));

  const text = await response.text();
  if (!response.ok) {
    console.log("body:", text.slice(0, 400));
    return null;
  }

  let json: { data?: LiveChannel[] } | undefined;
  try {
    json = JSON.parse(text) as { data?: LiveChannel[] };
  } catch {
    console.log("non-JSON body:", text.slice(0, 300));
    return null;
  }

  const rows = Array.isArray(json?.data) ? json.data : [];
  console.log(`rows: ${rows.length}`);
  if (rows.length === 0) console.log("body:", text.slice(0, 300));
  return rows;
}

function summarise(rows: LiveChannel[]) {
  const platforms = new Set(rows.map((r) => String(r.platform)));
  const withFollowers = rows.filter(
    (r) => typeof r.followers === "number" && r.followers > 0,
  );
  console.log("platforms present:", [...platforms].join(", ") || "(none)");
  console.log(
    `rows with a usable followers value: ${withFollowers.length}/${rows.length}`,
  );
  const sample = rows[0];
  if (sample) {
    console.log("first row:", JSON.stringify(sample).slice(0, 300));
  }
}

async function main() {
  // 1 + 2: does it work with no `game`, and does it honour a large limit?
  const noGame = await call("no game, limit=100", {
    platforms: "kick",
    limit: 100,
    offset: 0,
  });
  if (noGame) summarise(noGame);

  if (noGame && noGame.length > 0) {
    const big = await call("no game, limit=500 (probe the cap)", {
      platforms: "kick",
      limit: 500,
      offset: 0,
    });
    if (big) console.log(`=> limit=500 returned ${big.length} rows`);

    // Does offset actually advance, or is it ignored?
    const paged = await call("no game, limit=100, offset=100", {
      platforms: "kick",
      limit: 100,
      offset: 100,
    });
    if (paged && paged.length > 0) {
      const firstIds = new Set(noGame.map((r) => String(r.user_id)));
      const overlap = paged.filter((r) => firstIds.has(String(r.user_id)));
      console.log(
        `=> offset paging: ${overlap.length}/${paged.length} rows overlap page 1`,
      );
    }
  } else {
    // Fall back to the documented shape so we know the endpoint itself works.
    const withGame = await call("control: with game", {
      game: "Slots & Casino",
      platforms: "kick",
      limit: 25,
      offset: 0,
    });
    if (withGame) summarise(withGame);
  }
}

main().catch((error) => {
  console.error(
    "spike failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
