/**
 * Social creators from Stream Hatchet's social-profiles export.
 *
 * The catalog was built from the streaming session files only, so a creator
 * who never streams had no profile: of Stream Hatchet's top ten on Instagram
 * (Cristiano, Messi, Selena Gomez, Ariana Grande ...) the site had one (team
 * review, 2026-11-25). The export holds them all: every contact with its
 * Instagram, TikTok, X, YouTube, Twitch and Kick profiles.
 *
 * This worker creates one CreatorProfile per contact that
 *   - has an Instagram, TikTok, X or YouTube profile with at least
 *     --min-followers,
 *   - is marked "processed" by Stream Hatchet (the other states are mostly
 *     nameless, pictureless and years stale), and
 *   - owns no account we already hold, on any platform.
 * Each profile gets one link-only PlatformAccount per platform (highest reach
 * wins; discoverySource "sh-social", as --social-links writes them).
 *
 * A second run creates nothing twice: a created contact now owns accounts we
 * hold. It refreshes follower counts and pictures of the profiles this worker
 * made instead. Lowering --min-followers later only adds the new band.
 *
 * Dry run by default: writes <work-dir>/social-catalog-plan.csv and prints the
 * totals. Nothing is written to the database without --write.
 *
 * Usage:
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-social-catalog.ts
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-social-catalog.ts --skip-extract
 *   npx tsx --env-file=apps/web/.env.local workers/streamhatchet-social-catalog.ts --write --limit 500
 *
 * Flags:
 *   --min-followers N   default 1000000
 *   --include-contacts F  file of Stream Hatchet contact ids to bring in
 *                       whatever their size or status (a named roster)
 *   --snapshot NAME     export folder, default the latest daily one
 *   --skip-extract      reuse the social-profiles parquet in the work dir
 *   --limit N           create at most N profiles (largest first)
 *   --work-dir PATH     default /tmp/sh-social-catalog
 *   --aws-profile NAME  default streamhatchet-readonly (env credentials win)
 *   --write             apply
 */

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
} from "node:fs";
import { once } from "node:events";
import { Prisma, prisma, type Platform } from "@twitchmetrics/database";
import { recomputeCreatorAggregatesMany } from "@twitchmetrics/core/creator-aggregates";
import { normalizePlatformUrlForStorage } from "../apps/web/src/lib/platform-profile-url";

const BUCKET = "streamhatchet-social-profiles-data";
const EXPORT_PREFIX = "PostgreSQL-export";
const TABLE_SUBPATH = "partner_evaluator";
export const SOCIAL_CATALOG_SOURCE = "streamhatchet_social";
const DISCOVERY_SOURCE = "sh-social";
const CREATE_BATCH = 500;

const TYPE_TO_PLATFORM: Record<string, Platform> = {
  TwitchProfile: "twitch",
  YoutubeProfile: "youtube",
  KickProfile: "kick",
  InstagramProfile: "instagram",
  TiktokProfile: "tiktok",
  TwitterProfile: "x",
};
/**
 * A contact qualifies on these; Twitch and Kick only ride along as links (a
 * channel that streams is already in the catalog through the session files).
 * YouTube counts: a video creator who never goes live (Muselk 8.75M, EddieVR
 * 7.6M) is in no session file either.
 */
const QUALIFYING: Platform[] = ["instagram", "tiktok", "x", "youtube"];

const args = process.argv.slice(2);
function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}
function positiveInt(name: string, fallback: number): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return n;
}

const config = {
  minFollowers: positiveInt("--min-followers", 1_000_000),
  snapshot: argValue("--snapshot") ?? null,
  skipExtract: args.includes("--skip-extract"),
  includeFile: argValue("--include-contacts") ?? null,
  limit: argValue("--limit") ? positiveInt("--limit", 1) : null,
  workDir: argValue("--work-dir") ?? "/tmp/sh-social-catalog",
  awsProfile:
    argValue("--aws-profile") ??
    (process.env.AWS_ACCESS_KEY_ID ? null : "streamhatchet-readonly"),
  write: args.includes("--write"),
};

function log(message: string, data?: Record<string, unknown>) {
  const extra = data
    ? ` ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`
    : "";
  console.log(
    `[${new Date().toISOString()}] [social-catalog] ${message}${extra}`,
  );
}

function awsEnv(): NodeJS.ProcessEnv {
  return config.awsProfile
    ? { ...process.env, AWS_PROFILE: config.awsProfile }
    : process.env;
}

function duckdb(sql: string, extraArgs: string[] = []): string {
  return execFileSync("duckdb", [...extraArgs, "-c", sql], {
    env: awsEnv(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
}

const S3_SETUP = `INSTALL httpfs; LOAD httpfs; SET s3_region='us-east-1';
  CREATE SECRET (TYPE s3, PROVIDER credential_chain${
    config.awsProfile ? `, PROFILE '${config.awsProfile}'` : ""
  });`;

function resolveSnapshot(): string {
  if (config.snapshot) return config.snapshot;
  const out = execFileSync(
    "aws",
    ["s3", "ls", `s3://${BUCKET}/${EXPORT_PREFIX}/`],
    { env: awsEnv(), encoding: "utf8" },
  );
  const latest = out
    .split("\n")
    .map(
      (l) =>
        l.trim().match(/PRE (sh-snapshot-export-\d{4}-\d{2}-\d{2})\//)?.[1],
    )
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  if (!latest) throw new Error("No daily export folder found.");
  return latest;
}

function snapshotDate(snapshot: string): Date {
  const day = snapshot.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
  if (!day) throw new Error(`No date in snapshot name '${snapshot}'.`);
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Stream Hatchet contact ids to bring in whatever their size or status (a
 * named roster, e.g. an agency's talent). One per line: `id` or `id,Name`,
 * where Name replaces Stream Hatchet's (its record calls Northborders "Mike").
 * "#" starts a comment.
 */
let includedCache: Map<number, string | null> | null = null;
function includedContacts(): Map<number, string | null> {
  if (includedCache) return includedCache;
  includedCache = new Map();
  if (!config.includeFile) return includedCache;
  for (const raw of readFileSync(config.includeFile, "utf8").split("\n")) {
    const line = raw.split("#")[0]!.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\s*(?:,\s*(.+))?$/);
    if (!match) {
      throw new Error(`--include-contacts: cannot read line '${line}'.`);
    }
    includedCache.set(Number(match[1]), match[2]?.trim() || null);
  }
  return includedCache;
}
/** SQL list of the included ids; "-1" keeps `IN (...)` valid when empty. */
const includedSql = () => [...includedContacts().keys()].join(",") || "-1";

const spPath = () => `${config.workDir}/sp.parquet`;
const contactsPath = () => `${config.workDir}/contacts.parquet`;
const accountsPath = () => `${config.workDir}/accounts.csv`;
const planJsonPath = () => `${config.workDir}/social-catalog-plan.json`;
const planCsvPath = () => `${config.workDir}/social-catalog-plan.csv`;

/** Safe columns only: the export also carries OAuth tokens, never read here. */
function extractProfiles(snapshot: string): void {
  const base = `s3://${BUCKET}/${EXPORT_PREFIX}/${snapshot}/${TABLE_SUBPATH}`;
  const types = Object.keys(TYPE_TO_PLATFORM)
    .map((t) => `'${t}'`)
    .join(",");
  const platformCase = `CASE type ${Object.entries(TYPE_TO_PLATFORM)
    .map(([t, p]) => `WHEN '${t}' THEN '${p}'`)
    .join(" ")} END`;
  duckdb(`${S3_SETUP}
    COPY (
      SELECT
        TRY_CAST(contact_id AS BIGINT)        AS contact_id,
        ${platformCase}                        AS platform,
        CAST(user_id AS VARCHAR)               AS user_id,
        CAST(username AS VARCHAR)              AS username,
        CAST("name" AS VARCHAR)                AS display_name,
        CAST(raw_url AS VARCHAR)               AS raw_url,
        TRY_CAST(reach AS BIGINT)              AS reach,
        CAST(profile_image_url AS VARCHAR)     AS image_url,
        COALESCE(private_profile, false)       AS private_profile,
        CAST(last_sync_succeeded_at AS VARCHAR) AS synced_at
      FROM read_parquet('${base}/public.social_profiles/**/*.parquet')
      WHERE type IN (${types})
        AND contact_id IS NOT NULL
        AND user_id IS NOT NULL AND CAST(user_id AS VARCHAR) <> ''
    ) TO '${spPath()}' (FORMAT parquet);`);
  log("Extracted social profiles");
}

/** Small and tied to --min-followers and --include-contacts: read every run. */
function extractContacts(snapshot: string): void {
  const base = `s3://${BUCKET}/${EXPORT_PREFIX}/${snapshot}/${TABLE_SUBPATH}`;
  duckdb(`${S3_SETUP}
    COPY (
      SELECT
        TRY_CAST(id AS BIGINT)             AS contact_id,
        CAST("name" AS VARCHAR)            AS contact_name,
        CAST(profile_image_url AS VARCHAR) AS contact_image_url,
        CAST(status AS VARCHAR)            AS status,
        CAST(country AS VARCHAR)           AS country
      FROM read_parquet('${base}/public.contacts/**/*.parquet')
      WHERE id IN (
        SELECT DISTINCT contact_id FROM read_parquet('${spPath()}')
        WHERE platform IN (${QUALIFYING.map((p) => `'${p}'`).join(",")})
          AND reach >= ${config.minFollowers}
      ) OR id IN (${includedSql()})
    ) TO '${contactsPath()}' (FORMAT parquet);`);
  log("Extracted contacts");
}

/** Every account we hold, with the profile it belongs to and that profile's origin. */
async function exportOurAccounts(): Promise<number> {
  const out = createWriteStream(accountsPath());
  out.write("platform,user_id,creator_profile_id,catalog_source\n");
  const pageSize = 50_000;
  let cursor: string | null = null;
  let total = 0;
  for (;;) {
    const rows: {
      id: string;
      platform: Platform;
      platformUserId: string;
      creatorProfile: {
        id: string;
        mergedIntoId: string | null;
        catalogSource: string | null;
      };
    }[] = await prisma.platformAccount.findMany({
      select: {
        id: true,
        platform: true,
        platformUserId: true,
        creatorProfile: {
          select: { id: true, mergedIntoId: true, catalogSource: true },
        },
      },
      orderBy: { id: "asc" },
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    let chunk = "";
    for (const r of rows) {
      const uid = `"${r.platformUserId.replace(/"/g, '""')}"`;
      chunk += `${r.platform},${uid},${r.creatorProfile.mergedIntoId ?? r.creatorProfile.id},${r.creatorProfile.catalogSource ?? ""}\n`;
    }
    if (!out.write(chunk)) await once(out, "drain");
    total += rows.length;
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < pageSize) break;
  }
  out.end();
  await once(out, "finish");
  log("Exported our accounts", { rows: total });
  return total;
}

type Member = {
  platform: Platform;
  user_id: string;
  username: string | null;
  display_name: string | null;
  raw_url: string | null;
  reach: number | null;
  image_url: string | null;
  synced_at: string | null;
};
type PlanRow = {
  contact_id: number;
  contact_name: string | null;
  contact_image_url: string | null;
  country: string | null;
  /** Set when the contact already is one of the profiles this worker made. */
  creator_profile_id: string | null;
  members: Member[];
};

/**
 * New contacts (no account of theirs is ours) and, for the refresh, contacts
 * whose accounts all sit on one profile this worker created. One row per
 * (contact, platform): the highest-reach public profile.
 */
function buildPlan(): PlanRow[] {
  const qualifying = QUALIFYING.map((p) => `'${p}'`).join(",");
  duckdb(`
    CREATE TEMP TABLE sp AS SELECT * FROM read_parquet('${spPath()}');
    CREATE TEMP TABLE ours AS
      SELECT * FROM read_csv('${accountsPath()}', header=true, all_varchar=true);
    CREATE TEMP TABLE big AS
      SELECT sp.contact_id
      FROM sp JOIN read_parquet('${contactsPath()}') c USING (contact_id)
      GROUP BY sp.contact_id, c.status
      HAVING sp.contact_id IN (${includedSql()})
          OR (c.status = 'processed' AND max(sp.reach) FILTER (
               WHERE sp.platform IN (${qualifying}) AND NOT sp.private_profile
             ) >= ${config.minFollowers});
    CREATE TEMP TABLE held AS
      SELECT sp.contact_id,
             count(DISTINCT o.creator_profile_id) AS profiles,
             min(o.creator_profile_id)            AS creator_profile_id,
             bool_and(o.catalog_source = '${SOCIAL_CATALOG_SOURCE}') AS all_social
      FROM sp JOIN big USING (contact_id)
      JOIN ours o ON o.platform = sp.platform AND o.user_id = sp.user_id
      GROUP BY sp.contact_id;
    CREATE TEMP TABLE best AS
      SELECT * EXCLUDE (rn) FROM (
        SELECT sp.*, row_number() OVER (
          PARTITION BY sp.contact_id, sp.platform
          ORDER BY sp.reach DESC NULLS LAST, sp.user_id
        ) AS rn
        FROM sp JOIN big USING (contact_id)
        WHERE NOT sp.private_profile
      ) WHERE rn = 1;
    COPY (
      SELECT b.contact_id,
             c.contact_name, c.contact_image_url, c.country,
             h.creator_profile_id,
             list({
               platform: b.platform, user_id: b.user_id, username: b.username,
               display_name: b.display_name, raw_url: b.raw_url, reach: b.reach,
               image_url: b.image_url, synced_at: b.synced_at
             } ORDER BY b.reach DESC NULLS LAST) AS members
      FROM best b
      JOIN read_parquet('${contactsPath()}') c USING (contact_id)
      LEFT JOIN held h USING (contact_id)
      WHERE h.contact_id IS NULL OR (h.profiles = 1 AND h.all_social)
      GROUP BY ALL
    ) TO '${planJsonPath()}' (FORMAT json, ARRAY true);`);
  return JSON.parse(readFileSync(planJsonPath(), "utf8")) as PlanRow[];
}

function clean(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x1F\x7F]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/**
 * Pictures on Stream Hatchet's own host and X's do not expire. Instagram and
 * TikTok CDN links are signed and die within days, so they are not stored.
 */
function durableImage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith(".cloudfront.net") || host === "pbs.twimg.com")
      return url;
    if (host.endsWith(".ggpht.com") || host.endsWith(".googleusercontent.com"))
      return url;
    if (host === "static-cdn.jtvnw.net" || host === "files.kick.com")
      return url;
    return null;
  } catch {
    return null;
  }
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function syncedDate(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(`${raw.replace(" ", "T").slice(0, 23)}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

type Shaped = {
  row: PlanRow;
  displayName: string;
  primary: Member;
  avatarUrl: string | null;
  baseSlug: string;
  total: number;
};

function shape(row: PlanRow): Shaped | null {
  // Members come sorted by reach. A named contact may hold Twitch or Kick only.
  const social = row.members.filter((m) => QUALIFYING.includes(m.platform));
  const primary = social[0] ?? row.members[0];
  if (!primary) return null;
  const roster = includedContacts();
  // A YouTube channel Stream Hatchet holds without an @handle is one it
  // stopped refreshing years ago (25 of 8,993 read in the last six months) or
  // a page YouTube generates itself ("Movies", "Music", "Roblox - Topic").
  if (
    primary.platform === "youtube" &&
    !primary.username?.startsWith("@") &&
    !roster.has(row.contact_id)
  ) {
    return null;
  }
  // A name with no letter or digit ("👑" for @kingjames) is not a name.
  const named = (value: string | null | undefined) => {
    const text = clean(value, 120);
    return text && /[\p{L}\p{N}]/u.test(text) ? text : null;
  };
  const displayName =
    named(roster.get(row.contact_id)) ??
    named(row.contact_name) ??
    named(primary.display_name) ??
    clean(primary.username, 120);
  if (!displayName) return null;
  const avatarUrl =
    durableImage(row.contact_image_url) ??
    row.members.map((m) => durableImage(m.image_url)).find(Boolean) ??
    null;
  return {
    row,
    displayName,
    primary,
    avatarUrl,
    baseSlug: slugify(displayName) || slugify(primary.username ?? ""),
    total: row.members.reduce((sum, m) => sum + (m.reach ?? 0), 0),
  };
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writePlanCsv(shaped: Shaped[]): void {
  const platforms: Platform[] = [
    "instagram",
    "tiktok",
    "x",
    "youtube",
    "twitch",
    "kick",
  ];
  const lines = [
    [
      "contact_id",
      "display_name",
      "primary_platform",
      "total_followers",
      ...platforms.flatMap((p) => [`${p}_handle`, `${p}_followers`]),
      "has_picture",
      "primary_synced_at",
    ].join(","),
  ];
  for (const s of shaped) {
    const by = new Map(s.row.members.map((m) => [m.platform, m]));
    lines.push(
      [
        s.row.contact_id,
        s.displayName,
        s.primary.platform,
        s.total,
        ...platforms.flatMap((p) => [by.get(p)?.username, by.get(p)?.reach]),
        s.avatarUrl ? "yes" : "no",
        s.primary.synced_at?.slice(0, 10),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  writeFileSync(planCsvPath(), lines.join("\n"));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        /Server has closed the connection|Can't reach database server|Timed out fetching a new connection|connection pool|ECONNRESET|Response from the Engine was empty/i.test(
          message,
        );
      if (!retryable || attempt > 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function accountData(member: Member, creatorProfileId: string) {
  return {
    creatorProfileId,
    platform: member.platform,
    platformUserId: member.user_id,
    platformUsername: clean(member.username, 200) ?? member.user_id,
    platformDisplayName: clean(member.display_name, 200),
    platformUrl: normalizePlatformUrlForStorage(
      member.platform,
      clean(member.raw_url, 500),
    ),
    platformAvatarUrl: durableImage(member.image_url),
    followerCount: member.reach === null ? null : BigInt(member.reach),
    isOAuthConnected: false,
    discoverySource: DISCOVERY_SOURCE,
    // When Stream Hatchet last read this profile; null = it never told us.
    lastSyncedAt: syncedDate(member.synced_at),
  };
}

async function createProfiles(shaped: Shaped[]): Promise<void> {
  let created = 0;
  let accounts = 0;
  for (let i = 0; i < shaped.length; i += CREATE_BATCH) {
    const chunk = shaped.slice(i, i + CREATE_BATCH);

    // A clean slug when it is free, else the same slug with a suffix that is
    // fixed per contact (so a re-run after a crash picks the same one).
    const wanted = [...new Set(chunk.map((s) => s.baseSlug).filter(Boolean))];
    const taken = new Set(
      (
        await withRetry(() =>
          prisma.creatorProfile.findMany({
            where: { slug: { in: wanted } },
            select: { slug: true },
          }),
        )
      ).map((p) => p.slug),
    );
    const redirects = new Set(
      (
        await withRetry(() =>
          prisma.slugRedirect.findMany({
            where: { oldSlug: { in: wanted } },
            select: { oldSlug: true },
          }),
        )
      ).map((r) => r.oldSlug),
    );

    const profiles: Prisma.CreatorProfileCreateManyInput[] = [];
    const accountRows: ReturnType<typeof accountData>[] = [];
    for (const s of chunk) {
      const suffix = createHash("sha1")
        .update(`sh-contact:${s.row.contact_id}`)
        .digest("hex")
        .slice(0, 8);
      const free =
        s.baseSlug.length >= 2 &&
        !taken.has(s.baseSlug) &&
        !redirects.has(s.baseSlug);
      const slug = free ? s.baseSlug : `${s.baseSlug || "creator"}-${suffix}`;
      taken.add(slug);
      const id = randomUUID();
      const handles = s.row.members
        .map((m) => clean(m.username, 100))
        .filter(Boolean)
        .join(" ");
      profiles.push({
        id,
        displayName: s.displayName,
        slug,
        avatarUrl: s.avatarUrl,
        country: clean(s.row.country, 2),
        primaryPlatform: s.primary.platform,
        state: "unclaimed",
        snapshotTier: "tier3",
        catalogSource: SOCIAL_CATALOG_SOURCE,
        listed: true,
        searchText: `${s.displayName} ${handles}`.toLowerCase().slice(0, 500),
      });
      for (const member of s.row.members) {
        accountRows.push(accountData(member, id));
      }
    }

    await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.creatorProfile.createMany({
            data: profiles,
            skipDuplicates: true,
          });
          // An account another profile took meanwhile is skipped, not stolen.
          const result = await tx.platformAccount.createMany({
            data: accountRows,
            skipDuplicates: true,
          });
          accounts += result.count;
        },
        { timeout: 120_000 },
      ),
    );
    await withRetry(() =>
      recomputeCreatorAggregatesMany(profiles.map((p) => p.id as string)),
    );
    created += profiles.length;
    log("Created", { profiles: created, accounts, of: shaped.length });
  }
}

/** Follower counts and pictures of the profiles an earlier run created. */
async function refreshProfiles(rows: PlanRow[]): Promise<void> {
  let updated = 0;
  for (let i = 0; i < rows.length; i += CREATE_BATCH) {
    const chunk = rows.slice(i, i + CREATE_BATCH);
    const tuples = chunk.flatMap((row) =>
      row.members
        .filter((m) => m.reach !== null)
        .map(
          (m) =>
            Prisma.sql`(${row.creator_profile_id}::uuid, ${m.platform}::"Platform", ${m.user_id}, ${BigInt(m.reach as number)}::bigint, ${syncedDate(m.synced_at)}::timestamp)`,
        ),
    );
    if (tuples.length === 0) continue;
    updated += await withRetry(() =>
      prisma.$executeRaw(Prisma.sql`
        UPDATE "PlatformAccount" AS a
        SET "followerCount" = v.reach,
            "lastSyncedAt" = COALESCE(v.synced, a."lastSyncedAt"),
            "updatedAt" = now()
        FROM (VALUES ${Prisma.join(tuples)}) AS v(profile_id, platform, user_id, reach, synced)
        WHERE a."creatorProfileId" = v.profile_id
          AND a.platform = v.platform
          AND a."platformUserId" = v.user_id
          AND a."discoverySource" = ${DISCOVERY_SOURCE}
          AND a."followerCount" IS DISTINCT FROM v.reach
      `),
    );
    await withRetry(() =>
      recomputeCreatorAggregatesMany(
        chunk.map((row) => row.creator_profile_id as string),
      ),
    );
  }
  log("Refreshed existing social profiles", {
    profiles: rows.length,
    accountsChanged: updated,
  });
}

async function main() {
  if (!existsSync(config.workDir))
    mkdirSync(config.workDir, { recursive: true });
  const snapshot = resolveSnapshot();
  log("Starting", {
    snapshot,
    exportDate: snapshotDate(snapshot).toISOString().slice(0, 10),
    minFollowers: config.minFollowers,
    write: config.write,
    limit: config.limit,
  });

  if (config.skipExtract) {
    if (!existsSync(spPath())) {
      throw new Error(`--skip-extract needs ${spPath()}. Run once without it.`);
    }
  } else {
    extractProfiles(snapshot);
  }
  extractContacts(snapshot);
  await exportOurAccounts();

  const included = includedContacts();
  const plan = buildPlan();
  const existing = plan.filter((row) => row.creator_profile_id);
  const fresh = plan.filter((row) => !row.creator_profile_id);
  const shapedAll = fresh
    .map(shape)
    .filter((s): s is Shaped => s !== null)
    .sort(
      (a, b) =>
        Number(included.has(b.row.contact_id)) -
          Number(included.has(a.row.contact_id)) || b.total - a.total,
    );
  const shaped = config.limit ? shapedAll.slice(0, config.limit) : shapedAll;
  writePlanCsv(shaped);

  const byPlatform: Record<string, number> = {};
  for (const s of shaped) {
    byPlatform[s.primary.platform] = (byPlatform[s.primary.platform] ?? 0) + 1;
  }
  log("Plan", {
    newProfiles: shaped.length,
    fromIncludeList: shaped.filter((s) => included.has(s.row.contact_id))
      .length,
    skippedNoNameOrNoYouTubeHandle: fresh.length - shapedAll.length,
    withPicture: shaped.filter((s) => s.avatarUrl).length,
    byPrimaryPlatform: byPlatform,
    accounts: shaped.reduce((sum, s) => sum + s.row.members.length, 0),
    alreadyCreatedToRefresh: existing.length,
    planCsv: planCsvPath(),
  });
  for (const s of shaped.slice(0, 25)) {
    log("  top", {
      name: s.displayName,
      primary: `${s.primary.platform}:${s.primary.username}`,
      total: s.total,
    });
  }

  if (!config.write) {
    log("Dry run complete. Pass --write to apply.");
    return;
  }
  await createProfiles(shaped);
  await refreshProfiles(existing);
  log("Finished", { created: shaped.length, refreshed: existing.length });
}

main()
  .catch((error) => {
    console.error(
      `[social-catalog] Fatal: ${error instanceof Error ? error.stack : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
