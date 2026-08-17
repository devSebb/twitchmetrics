/**
 * Enrichment for StreamHatchet-born creator profiles.
 *
 * SH-born profiles (catalogSource = 'streamhatchet', ~975k) are never touched
 * by the API tier crons or `enrich-creators` (both scoped to API-born /
 * claimed profiles), so as of the 2026-08-16 healthcheck: 199k listed twitch
 * + 25k listed kick creators had NO avatar (the S3 daily files carry no logo
 * for those platforms), and 0 SH-born profiles had primaryGame /
 * lastStreamAt / isActiveLast30d — the /creators game filter only worked for
 * the 40k API-born rows. This worker fills those from cheap sources:
 *
 *   --twitch-avatars  Twitch Helix GET /users (100 ids/call, app token) →
 *                     PlatformAccount.platformAvatarUrl/platformDisplayName,
 *                     CreatorProfile.avatarUrl (+bio) when empty.
 *   --kick-avatars    Kick public API GET /channels?slug= (50/call, app token)
 *                     → PlatformAccount.platformAvatarUrl, CreatorProfile
 *                     avatarUrl/bannerUrl/bio when empty. Kick platformUserIds
 *                     from SH are not Kick broadcaster ids, so lookups go by
 *                     slug (= platformUsername).
 *   --activity        Set-based, from our own SH rollups: lastStreamAt +
 *                     isActiveLast30d from ChannelDailyRollup, primaryGameName
 *                     (top game by minutes watched, last 30d) + primaryGameSlug
 *                     (Game.name match) from ChannelGameDailyRollup. Only for
 *                     profiles the API pipeline does not own (SH-born,
 *                     unclaimed, no user).
 *
 * All modes are idempotent and safe to re-run weekly. Dry-run by default.
 *
 * Options: --write, --limit N (accounts per avatar mode), --sleep-ms N
 *          (between API calls, default 150), --only-missing (default; avatar
 *          modes only look at accounts with no platformAvatarUrl yet).
 *
 * Usage: pnpm worker:enrich-sh-profiles -- --twitch-avatars --kick-avatars --activity --write
 */
import { PrismaClient, Prisma } from "@prisma/client";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const DO_TWITCH = args.includes("--twitch-avatars");
const DO_KICK = args.includes("--kick-avatars");
const DO_ACTIVITY = args.includes("--activity");
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = Number.parseInt(argValue("--limit") ?? "0", 10) || 0;
const SLEEP_MS = Number.parseInt(argValue("--sleep-ms") ?? "150", 10) || 0;

// One pinned connection on the DIRECT url: the activity pass builds a temp
// table and reads it back across several statements; the pooler would hand
// those to different backends. Long statements are expected — raise the
// timeout for this session only (session-scoped on a direct connection).
const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directUrl
        ? `${directUrl}${directUrl.includes("?") ? "&" : "?"}connection_limit=1`
        : undefined,
    },
  },
});

function log(msg: string, data?: unknown) {
  const payload =
    data === undefined
      ? ""
      : " " +
        JSON.stringify(data, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );
  console.log(
    `[${new Date().toISOString()}] [enrich-sh-profiles] ${msg}${payload}`,
  );
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Postgres text cannot hold NUL; Prisma's param encoder also chokes on stray
 *  control chars ("unexpected end of hex escape"). Strip them from API text. */
function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  const out = v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Lone surrogates (e.g. an emoji pair cut in half by a slice) serialize
    // to a dangling \uD8xx escape that the query engine rejects.
    .replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "",
    )
    .trim();
  return out.length ? out : null;
}

function isRetryableDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /closed the connection|Connection terminated|ECONNRESET|timed out|Timed out|Can't reach database|connection pool/i.test(
      msg,
    ) ||
    (err instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"].includes(err.code))
  );
}

/** Neon drops idle-ish connections every ~15 min; absorb that instead of dying. */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 60): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (!isRetryableDbError(e) || attempt > maxRetries) throw e;
      const wait = Math.min(30_000, 1_000 * 2 ** attempt);
      log(`retryable DB error, retry ${attempt}/${maxRetries} in ${wait}ms`, {
        error: e instanceof Error ? e.message.split("\n").pop() : String(e),
      });
      await sleep(wait);
    }
  }
}

// ---------------------------------------------------------------------------
// Tokens (client credentials; adapters live under apps/web with `@/` imports)
// ---------------------------------------------------------------------------

async function twitchToken(): Promise<string> {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET missing");
  // Same shape as apps/web/src/server/adapters/twitch.ts getAppAccessToken:
  // params in the query string of a bodiless POST.
  const params = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, {
    method: "POST",
  });
  if (!res.ok)
    throw new Error(
      `twitch token ${res.status} ${await res.text().catch(() => "")}`.slice(
        0,
        200,
      ),
    );
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function kickToken(): Promise<string> {
  const id = process.env.KICK_CLIENT_ID;
  const secret = process.env.KICK_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error("KICK_CLIENT_ID / KICK_CLIENT_SECRET missing");
  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`kick token ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function fetchJsonWithBackoff<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 30; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      // ECONNRESET / DNS blip / 30s stall — retry like a 5xx.
      const wait = Math.min(60_000, 1_000 * 2 ** attempt);
      log(`api network error, retrying in ${wait}ms`, {
        error: e instanceof Error ? e.message : String(e),
        url: url.slice(0, 80),
      });
      await sleep(wait);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min(60_000, 1_000 * 2 ** attempt);
      log(`api ${res.status}, backing off ${wait}ms`, {
        url: url.slice(0, 80),
      });
      await sleep(wait);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok)
      throw new Error(
        `api ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300),
      );
    return (await res.json()) as T;
  }
  throw new Error("api: gave up after retries");
}

// ---------------------------------------------------------------------------
// Avatar targets
// ---------------------------------------------------------------------------

type Target = {
  account_id: string;
  profile_id: string;
  platform_user_id: string;
  username: string;
  primary: boolean; // account.platform == profile.primaryPlatform
  profile_avatar: string | null;
  profile_bio: string | null;
  profile_banner: string | null;
};

async function loadTargets(platform: "twitch" | "kick"): Promise<Target[]> {
  const limitSql = LIMIT ? Prisma.sql`LIMIT ${LIMIT}` : Prisma.empty;
  return withRetry(
    () => prisma.$queryRaw<Target[]>`
    SELECT pa.id AS account_id, cp.id AS profile_id, pa."platformUserId" AS platform_user_id,
           pa."platformUsername" AS username, (pa.platform = cp."primaryPlatform") AS "primary",
           cp."avatarUrl" AS profile_avatar, cp.bio AS profile_bio, cp."bannerUrl" AS profile_banner
    FROM "PlatformAccount" pa
    JOIN "CreatorProfile" cp ON cp.id = pa."creatorProfileId"
    WHERE pa.platform = ${platform}::"Platform"
      AND pa."discoverySource" IS NULL
      AND pa."platformAvatarUrl" IS NULL
      AND cp."mergedIntoId" IS NULL
      AND cp."catalogSource" = 'streamhatchet'
    ORDER BY cp.listed DESC, cp."totalFollowers" DESC
    ${limitSql}
  `,
  );
}

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  description: string;
};
type KickChannel = {
  slug?: string;
  broadcaster_user_id?: number | string;
  banner_picture?: string | null;
  channel_description?: string | null;
};
type KickUser = {
  user_id?: number | string;
  name?: string | null;
  profile_picture?: string | null;
};

type AvatarUpdate = {
  target: Target;
  avatar: string | null;
  displayName?: string | null;
  bio?: string | null;
  banner?: string | null;
};

/**
 * Apply one API batch as two set-based UPDATEs (VALUES join) instead of
 * hundreds of single-row round trips — ~500k accounts would otherwise take
 * hours on Neon latency alone. Profile fields only fill EMPTY values and only
 * from the profile's primary-platform account.
 */
async function applyAvatarBatch(updates: AvatarUpdate[]) {
  if (!WRITE || updates.length === 0) return;
  const accountRows = updates.filter((u) => u.avatar || u.displayName);
  if (accountRows.length) {
    await withRetry(
      () => prisma.$executeRaw`
      UPDATE "PlatformAccount" pa
      SET "platformAvatarUrl" = COALESCE(v.avatar, pa."platformAvatarUrl"),
          "platformDisplayName" = COALESCE(v.display_name, pa."platformDisplayName")
      FROM (VALUES ${Prisma.join(
        accountRows.map(
          (u) =>
            Prisma.sql`(${u.target.account_id}::uuid, ${u.avatar ?? null}::text, ${u.displayName ?? null}::text)`,
        ),
      )}) AS v(id, avatar, display_name)
      WHERE pa.id = v.id`,
    );
  }
  const profileRows = updates.filter(
    (u) =>
      u.target.primary &&
      ((u.avatar && !u.target.profile_avatar) ||
        (u.bio && !u.target.profile_bio) ||
        (u.banner && !u.target.profile_banner)),
  );
  if (profileRows.length) {
    await withRetry(
      () => prisma.$executeRaw`
      UPDATE "CreatorProfile" cp
      SET "avatarUrl" = COALESCE(cp."avatarUrl", v.avatar),
          bio = COALESCE(NULLIF(cp.bio, ''), v.bio),
          "bannerUrl" = COALESCE(cp."bannerUrl", v.banner)
      FROM (VALUES ${Prisma.join(
        profileRows.map(
          (u) =>
            Prisma.sql`(${u.target.profile_id}::uuid, ${u.avatar ?? null}::text, ${u.bio ? clean(u.bio.slice(0, 500)) : null}::text, ${u.banner ?? null}::text)`,
        ),
      )}) AS v(id, avatar, bio, banner)
      WHERE cp.id = v.id`,
    );
  }
}

async function twitchAvatars() {
  const targets = await loadTargets("twitch");
  log(`twitch accounts without avatar (SH-born): ${targets.length}`);
  if (!targets.length) return;
  const token = await twitchToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Client-Id": process.env.TWITCH_CLIENT_ID!,
  };
  let found = 0,
    missing = 0,
    calls = 0;
  for (let i = 0; i < targets.length; i += 100) {
    const batch = targets.slice(i, i + 100);
    // Twitch user ids are numeric; anything else in the catalog is junk that
    // makes Helix reject the whole batch (400 "Bad Identifiers").
    const valid = batch.filter((t) => /^\d+$/.test(t.platform_user_id));
    const byId = new Map(valid.map((t) => [t.platform_user_id, t]));
    let res: { data: TwitchUser[] } | null = null;
    if (valid.length) {
      const query = valid.map((t) => `id=${t.platform_user_id}`).join("&");
      try {
        res = await fetchJsonWithBackoff<{ data: TwitchUser[] }>(
          `https://api.twitch.tv/helix/users?${query}`,
          headers,
        );
      } catch (e) {
        // A 4xx on one batch (bad identifiers etc.) must not kill a 500k pass.
        log(`twitch batch skipped`, {
          at: i,
          error: e instanceof Error ? e.message.slice(0, 160) : String(e),
        });
      }
      calls++;
    }
    const seen = new Set<string>();
    const updates: AvatarUpdate[] = [];
    for (const u of res?.data ?? []) {
      const t = byId.get(u.id);
      if (!t) continue;
      seen.add(u.id);
      found++;
      updates.push({
        target: t,
        avatar: clean(u.profile_image_url),
        displayName: clean(u.display_name),
        bio: clean(u.description),
      });
    }
    await applyAvatarBatch(updates);
    missing += batch.length - seen.size; // banned/deleted/renamed-away users
    if (calls % 50 === 0)
      log(`twitch progress`, {
        done: i + batch.length,
        total: targets.length,
        found,
        missing,
      });
    await sleep(SLEEP_MS);
  }
  log(`twitch avatars ${WRITE ? "applied" : "dry-run"}`, {
    found,
    missing,
    calls,
  });
}

async function kickAvatars() {
  const targets = await loadTargets("kick");
  log(`kick accounts without avatar (SH-born): ${targets.length}`);
  if (!targets.length) return;
  const token = await kickToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  let found = 0,
    missing = 0,
    calls = 0;
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    const bySlug = new Map(batch.map((t) => [t.username.toLowerCase(), t]));
    const url = new URL("https://api.kick.com/public/v1/channels");
    for (const t of batch)
      url.searchParams.append("slug", t.username.toLowerCase());
    const res = await fetchJsonWithBackoff<{ data?: KickChannel[] }>(
      url.toString(),
      headers,
    );
    calls++;
    const seen = new Set<string>();
    const updates: AvatarUpdate[] = [];
    // /channels carries banner + description but NO avatar; avatars come from
    // /users?id=<broadcaster_user_id> (profile_picture), so do the two-hop.
    const channelBySlug = new Map<string, KickChannel>();
    for (const c of res?.data ?? []) {
      const slug = (c.slug ?? "").toLowerCase();
      if (bySlug.has(slug)) channelBySlug.set(slug, c);
    }
    const userIds = [...channelBySlug.values()]
      .map((c) => c.broadcaster_user_id)
      .filter((v): v is number | string => v != null)
      .map(String);
    const avatarByUserId = new Map<
      string,
      { avatar: string | null; name: string | null }
    >();
    if (userIds.length) {
      const uurl = new URL("https://api.kick.com/public/v1/users");
      for (const id of userIds) uurl.searchParams.append("id", id);
      const ures = await fetchJsonWithBackoff<{ data?: KickUser[] }>(
        uurl.toString(),
        headers,
      );
      calls++;
      for (const u of ures?.data ?? []) {
        if (u.user_id == null) continue;
        avatarByUserId.set(String(u.user_id), {
          avatar: u.profile_picture ?? null,
          name: u.name ?? null,
        });
      }
    }
    for (const [slug, c] of channelBySlug) {
      const t = bySlug.get(slug);
      if (!t) continue;
      seen.add(slug);
      const user =
        c.broadcaster_user_id != null
          ? avatarByUserId.get(String(c.broadcaster_user_id))
          : undefined;
      if (user?.avatar) found++;
      updates.push({
        target: t,
        avatar: clean(user?.avatar),
        displayName: clean(user?.name),
        bio: clean(c.channel_description),
        banner: clean(c.banner_picture),
      });
    }
    await applyAvatarBatch(updates);
    missing += batch.length - seen.size;
    if (calls % 50 === 0)
      log(`kick progress`, {
        done: i + batch.length,
        total: targets.length,
        found,
        missing,
      });
    await sleep(SLEEP_MS);
  }
  log(`kick avatars ${WRITE ? "applied" : "dry-run"}`, {
    found,
    missing,
    calls,
  });
}

// ---------------------------------------------------------------------------
// Activity + primary game from SH rollups
// ---------------------------------------------------------------------------

async function activity() {
  await prisma.$executeRawUnsafe(`SET statement_timeout = '20min'`);
  log(
    "activity: building per-profile activity + top-game temp table (last 90d / 30d)…",
  );
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS tmp_sh_activity`);
  await prisma.$executeRawUnsafe(`
    CREATE TEMP TABLE tmp_sh_activity AS
    WITH owned AS (
      SELECT id FROM "CreatorProfile"
      WHERE "catalogSource" = 'streamhatchet' AND "mergedIntoId" IS NULL
        AND state = 'unclaimed' AND "userId" IS NULL
    ),
    act AS (
      SELECT r."creatorProfileId" AS id,
             MAX(COALESCE(r."lastStreamAt", r.date::timestamp)) AS last_stream_at,
             BOOL_OR(r.date >= CURRENT_DATE - 30) AS active30
      FROM "ChannelDailyRollup" r
      JOIN owned o ON o.id = r."creatorProfileId"
      WHERE r.date >= CURRENT_DATE - 90
      GROUP BY 1
    ),
    g AS (
      SELECT r."creatorProfileId" AS id, r."gameName", SUM(r."minutesWatched") AS mw
      FROM "ChannelGameDailyRollup" r
      JOIN owned o ON o.id = r."creatorProfileId"
      WHERE r.date >= CURRENT_DATE - 30 AND r."gameName" IS NOT NULL AND r."gameName" <> ''
      GROUP BY 1, 2
    ),
    top AS (
      SELECT DISTINCT ON (id) id, "gameName" FROM g ORDER BY id, mw DESC
    ),
    game_slug AS (
      SELECT DISTINCT ON (LOWER(name)) LOWER(name) AS lname, slug FROM "Game" ORDER BY LOWER(name), slug
    )
    SELECT a.id, a.last_stream_at, a.active30, t."gameName" AS game_name, gs.slug AS game_slug
    FROM act a
    LEFT JOIN top t ON t.id = a.id
    LEFT JOIN game_slug gs ON gs.lname = LOWER(t."gameName")
  `);
  const stats = await prisma.$queryRawUnsafe<
    { n: bigint; with_game: bigint; with_slug: bigint; active30: bigint }[]
  >(`
    SELECT COUNT(*) n, COUNT(game_name) with_game, COUNT(game_slug) with_slug, COUNT(*) FILTER (WHERE active30) active30 FROM tmp_sh_activity`);
  log("activity: computed", stats[0]);
  if (!WRITE) return;

  // Chunk by uuid prefix so each UPDATE stays small and commits on its own.
  const hex = "0123456789abcdef".split("");
  let updated = 0;
  for (const h of hex) {
    const n = await prisma.$executeRawUnsafe(`
      UPDATE "CreatorProfile" cp
      SET "lastStreamAt" = t.last_stream_at,
          "isActiveLast30d" = t.active30,
          "primaryGameName" = COALESCE(t.game_name, cp."primaryGameName"),
          "primaryGameSlug" = COALESCE(t.game_slug, cp."primaryGameSlug"),
          "lastEnrichedAt" = NOW()
      FROM tmp_sh_activity t
      WHERE t.id = cp.id AND cp.id::text LIKE '${h}%'
        AND (cp."lastStreamAt" IS DISTINCT FROM t.last_stream_at
          OR cp."isActiveLast30d" IS DISTINCT FROM t.active30
          OR (t.game_name IS NOT NULL AND cp."primaryGameName" IS DISTINCT FROM t.game_name)
          OR (t.game_slug IS NOT NULL AND cp."primaryGameSlug" IS DISTINCT FROM t.game_slug))
    `);
    updated += n;
    log(`activity chunk ${h}`, { updated: n });
  }
  // Profiles that streamed >90d ago (or never in our data): mark inactive.
  const inactive = await prisma.$executeRawUnsafe(`
    UPDATE "CreatorProfile" cp SET "isActiveLast30d" = false
    WHERE cp."catalogSource" = 'streamhatchet' AND cp."mergedIntoId" IS NULL AND cp.state = 'unclaimed' AND cp."userId" IS NULL
      AND cp."isActiveLast30d" = true
      AND NOT EXISTS (SELECT 1 FROM tmp_sh_activity t WHERE t.id = cp.id AND t.active30)`);
  log("activity applied", { updated, markedInactive: inactive });
}

async function main() {
  if (!DO_TWITCH && !DO_KICK && !DO_ACTIVITY) {
    console.error(
      "nothing to do: pass --twitch-avatars / --kick-avatars / --activity",
    );
    process.exitCode = 2;
    return;
  }
  log(`start mode=${WRITE ? "WRITE" : "dry-run"}`, {
    twitch: DO_TWITCH,
    kick: DO_KICK,
    activity: DO_ACTIVITY,
    limit: LIMIT || null,
  });
  if (DO_ACTIVITY) await activity();
  if (DO_TWITCH) await twitchAvatars();
  if (DO_KICK) await kickAvatars();
  log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
