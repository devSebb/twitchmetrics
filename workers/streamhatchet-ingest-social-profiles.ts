/**
 * StreamHatchet "social profiles" ingestion — the GROUND-TRUTH identity + enrichment feed.
 *
 * Source: the daily Parquet export SH drops in
 *   s3://streamhatchet-social-profiles-data/PostgreSQL-export/<snapshot>/partner_evaluator/
 * with two tables:
 *   - public.social_profiles : one row per social profile (twitch.tv/ibai, a
 *     youtube channel, a kick channel …). Key columns we use:
 *        type       -> platform ('TwitchProfile'|'YoutubeProfile'|'KickProfile'|…)
 *        user_id    -> the platform NATIVE id  == our PlatformAccount.platformUserId
 *        contact_id -> FK to contacts.id (nullable) == the creator this profile belongs to
 *   - public.contacts : one row per creator (name, country, gender, demographics, scores…)
 *
 * What this does (per snapshot):
 *   1. DuckDB streams social_profiles straight from S3 (KMS-decrypted via our
 *      creds), filtered to twitch/youtube/kick + non-empty user_id, projected to
 *      SAFE columns only (NEVER the OAuth token/secret/refresh_token columns).
 *   2. Exports our PlatformAccount(platform, platformUserId, creatorProfileId) to CSV.
 *   3. Joins the two: profiles whose user_id matches one of ours reveal which SH
 *      `contact_id`s touch our catalog; we then pull ALL sibling profiles of those
 *      contacts (the cross-platform group).
 *   4. Applies the group:
 *        - If ≥2 of OUR CreatorProfiles share a contact_id, they are the SAME
 *          creator → merge them under one canonical profile via the reversible
 *          IdentityLink merge (signal="contact_id", confidence 1.0). This is the
 *          authoritative replacement for the heuristic resolver.ts.
 *        - Enrich the surviving/only profile from the contacts row (country,
 *          gender, age, bio) — only filling EMPTY fields, and NEVER touching a
 *          claimed/premium/owned profile.
 *
 * Dry-run by default. Pass --write to mutate. Safe to re-run (merge is idempotent;
 * enrichment only fills blanks).
 *
 * Usage:
 *   pnpm worker:streamhatchet-social                         # dry run, latest daily snapshot
 *   pnpm worker:streamhatchet-social -- --sample             # dry run, first parquet part only (fast dev)
 *   pnpm worker:streamhatchet-social -- --snapshot sh-snapshot-export-2026-07-14-test --sample
 *   pnpm worker:streamhatchet-social -- --write --limit 500  # apply, capped to 500 contact groups
 *   pnpm worker:streamhatchet-social -- --write --skip-extract # resume: reuse local parquets, skip the S3 re-scan
 *
 *   pnpm worker:streamhatchet-social -- --social-links           # dry run: attach IG/TikTok/X links
 *   pnpm worker:streamhatchet-social -- --social-links --write   # apply link-only social accounts
 *
 * Flags: --write --sample --snapshot <name> --limit <n> --work-dir <path>
 *        --aws-profile <name> --bio-max-len <n> --skip-extract --social-links
 *
 * NOTE: --social-links needs a FRESH extract (all 6 platforms). Don't combine it
 * with --skip-extract against a parquet extracted before social platforms existed.
 */

import { execFileSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { prisma, type Platform } from "@twitchmetrics/database";
import {
  ClaimLockedError,
  isClaimLocked,
  mergeProfiles,
  pickCanonical,
} from "../apps/web/src/server/services/identity/merge";
import { canonicalProfileId } from "../apps/web/src/server/services/identity/canonical-profile";
import { normalizePlatformUrlForStorage } from "../apps/web/src/lib/platform-profile-url";

const args = process.argv.slice(2);
const BUCKET = "streamhatchet-social-profiles-data";
const EXPORT_PREFIX = "PostgreSQL-export";
const TABLE_SUBPATH = "partner_evaluator";

// SH social_profiles.type -> our Platform enum.
const TYPE_TO_PLATFORM: Record<string, Platform> = {
  TwitchProfile: "twitch",
  YoutubeProfile: "youtube",
  KickProfile: "kick",
  InstagramProfile: "instagram",
  TiktokProfile: "tiktok",
  TwitterProfile: "x",
};
const SP_TYPES = Object.keys(TYPE_TO_PLATFORM);

// Streaming platforms we hold metric-tracked accounts for — these drive the
// merge/enrich flow. The rest are link-only socials attached (handle + follower
// count) to already-matched creators via --social-links, marked discoverySource.
const SOCIAL_LINK_PLATFORMS: Platform[] = ["instagram", "tiktok", "x"];
const DISCOVERY_SOURCE = "sh-social";

type Config = {
  snapshot: string | null; // explicit snapshot folder, else latest daily
  write: boolean;
  sample: boolean; // read only the first parquet part per table (fast dev)
  limit: number | null; // cap contact groups in the apply phase
  workDir: string;
  awsProfile: string;
  bioMaxLen: number;
  // Reuse the sp.parquet / contacts.parquet already in workDir instead of
  // re-scanning ~50GB from S3 — for cheaply resuming an interrupted run. The
  // PlatformAccount export + join + apply still re-run (they're fast + idempotent).
  skipExtract: boolean;
  // Attach-social-links mode: skip merge/enrich; instead attach IG/TikTok/X
  // link-only PlatformAccounts (handle + follower count) to already-matched
  // creators. Needs a fresh (6-platform) extract — do NOT pass --skip-extract
  // against a parquet that was extracted before social platforms were included.
  socialLinks: boolean;
};

function argValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseConfig(): Config {
  return {
    snapshot: argValue("--snapshot") ?? null,
    write: args.includes("--write"),
    sample: args.includes("--sample"),
    limit: argValue("--limit")
      ? parsePositiveInt(argValue("--limit"), 0) || null
      : null,
    workDir: argValue("--work-dir") ?? "/tmp/sh-social",
    awsProfile: argValue("--aws-profile") ?? "streamhatchet-readonly",
    bioMaxLen: parsePositiveInt(argValue("--bio-max-len"), 500),
    skipExtract: args.includes("--skip-extract"),
    socialLinks: args.includes("--social-links"),
  };
}

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  const ts = new Date().toISOString();
  const extra = data
    ? ` ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`
    : "";
  console[level](`[${ts}] [sh-social-ingest] ${message}${extra}`);
}

function aws(argv: string[], profile: string): string {
  return execFileSync("aws", argv, {
    env: { ...process.env, AWS_PROFILE: profile },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function duckdb(sql: string, profile: string): string {
  return execFileSync("duckdb", ["-c", sql], {
    env: { ...process.env, AWS_PROFILE: profile },
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
}

/** Run a single-value query and return the raw scalar (no ASCII-box framing). */
function duckdbScalar(sql: string, profile: string): string {
  return execFileSync("duckdb", ["-noheader", "-csv", "-c", sql], {
    env: { ...process.env, AWS_PROFILE: profile },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

const S3_SETUP = (profile: string) =>
  `INSTALL httpfs; LOAD httpfs; SET s3_region='us-east-1';
   CREATE SECRET (TYPE s3, PROVIDER credential_chain, PROFILE '${profile}');`;

/** Phase 0 — pick the snapshot folder (explicit, or the latest daily that has both tables). */
function resolveSnapshot(config: Config): string {
  if (config.snapshot) return config.snapshot;
  const out = aws(
    ["s3", "ls", `s3://${BUCKET}/${EXPORT_PREFIX}/`],
    config.awsProfile,
  );
  const folders = out
    .split("\n")
    .map((l) => l.trim().match(/PRE (sh-snapshot-export-[^/]+)\//)?.[1])
    .filter((x): x is string => Boolean(x))
    // recurring daily folders only — skip -test / -manual one-offs
    .filter((name) => /^sh-snapshot-export-\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();
  const latest = folders.at(-1);
  if (!latest) {
    throw new Error(
      "No daily snapshot folder found (looked for sh-snapshot-export-YYYY-MM-DD). Pass --snapshot explicitly.",
    );
  }
  return latest;
}

function tableGlob(snapshot: string, table: string, sample: boolean): string {
  const base = `s3://${BUCKET}/${EXPORT_PREFIX}/${snapshot}/${TABLE_SUBPATH}/public.${table}`;
  // Real runs read every part; --sample reads only the first part per table.
  return sample ? `${base}/**/part-00000-*.parquet` : `${base}/**/*.parquet`;
}

/** Phase 1a — filtered, SAFE-columns-only extract of social_profiles to a local parquet. */
function extractSocialProfiles(config: Config, snapshot: string): void {
  const glob = tableGlob(snapshot, "social_profiles", config.sample);
  const typeList = SP_TYPES.map((t) => `'${t}'`).join(",");
  // Derive the type->platform CASE from the map so it can't drift out of sync.
  const platformCase = `CASE type ${SP_TYPES.map(
    (t) => `WHEN '${t}' THEN '${TYPE_TO_PLATFORM[t]}'`,
  ).join(" ")} END`;
  const sql = `${S3_SETUP(config.awsProfile)}
    COPY (
      SELECT
        TRY_CAST(contact_id AS BIGINT)      AS contact_id,
        type,
        ${platformCase}                      AS platform,
        CAST(user_id AS VARCHAR)             AS user_id,
        CAST(username AS VARCHAR)            AS username,
        CAST(raw_url AS VARCHAR)             AS raw_url,
        TRY_CAST(reach AS BIGINT)            AS reach,
        verified_profile
      FROM read_parquet('${glob}')
      WHERE type IN (${typeList})
        AND user_id IS NOT NULL AND user_id <> ''
    ) TO '${config.workDir}/sp.parquet' (FORMAT parquet);`;
  duckdb(sql, config.awsProfile);
  const rows = duckdbScalar(
    `SELECT count(*) FROM read_parquet('${config.workDir}/sp.parquet');`,
    config.awsProfile,
  );
  log("info", "Extracted social_profiles (safe cols)", {
    rows: Number(rows),
    sample: config.sample,
  });
}

/** Phase 1b — SAFE-columns-only extract of contacts to a local parquet. */
function extractContacts(config: Config, snapshot: string): void {
  const glob = tableGlob(snapshot, "contacts", config.sample);
  const sql = `${S3_SETUP(config.awsProfile)}
    COPY (
      SELECT
        TRY_CAST(id AS BIGINT)              AS contact_id,
        CAST(name AS VARCHAR)               AS name,
        CAST(country AS VARCHAR)            AS country,
        CAST(gender AS VARCHAR)             AS gender,
        CAST(lang AS VARCHAR)               AS lang,
        TRY_CAST(birth_year AS INTEGER)     AS birth_year,
        CAST(description AS VARCHAR)         AS bio,
        CAST(audience_age AS VARCHAR)       AS audience_age,
        CAST(audience_country AS VARCHAR)   AS audience_country,
        CAST(audience_gender AS VARCHAR)    AS audience_gender,
        TRY_CAST(influence_score AS DOUBLE) AS influence_score
      FROM read_parquet('${glob}')
    ) TO '${config.workDir}/contacts.parquet' (FORMAT parquet);`;
  duckdb(sql, config.awsProfile);
  log("info", "Extracted contacts (safe cols)");
}

/**
 * Phase 2 — export our PlatformAccount rows for the 3 platforms to CSV for the
 * join. Accounts left on merge redirect stubs are attributed to their canonical
 * creator so one Stream Hatchet contact does not look falsely ambiguous.
 */
async function exportOurAccounts(config: Config): Promise<number> {
  const path = `${config.workDir}/accounts.csv`;
  const platforms: Platform[] = ["twitch", "youtube", "kick"];
  const pageSize = 50_000;
  let cursor: string | null = null;
  let total = 0;
  const lines: string[] = ["platform,user_id,creator_profile_id"];
  for (;;) {
    const rows: {
      id: string;
      platform: Platform;
      platformUserId: string;
      creatorProfile: {
        id: string;
        mergedIntoId: string | null;
      };
    }[] = await prisma.platformAccount.findMany({
      where: { platform: { in: platforms } },
      select: {
        id: true,
        platform: true,
        platformUserId: true,
        creatorProfile: {
          select: {
            id: true,
            mergedIntoId: true,
          },
        },
      },
      orderBy: { id: "asc" },
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      // user_id is an opaque platform id; escape only the (rare) comma/quote.
      const uid = /[",]/.test(r.platformUserId)
        ? `"${r.platformUserId.replace(/"/g, '""')}"`
        : r.platformUserId;
      lines.push(
        `${r.platform},${uid},${canonicalProfileId(r.creatorProfile)}`,
      );
    }
    total += rows.length;
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < pageSize) break;
  }
  writeFileSync(path, lines.join("\n"));
  log("info", "Exported our PlatformAccounts", { rows: total });
  return total;
}

// Shape matching PROFILE_SELECT in merge.ts, so pickCanonical/mergeProfiles
// accept these structurally (the type itself is module-private there).
type LiveProfile = {
  id: string;
  state: string;
  userId: string | null;
  totalFollowers: bigint;
  lastStreamAt: Date | null;
  listed: boolean;
  mergedIntoId: string | null;
  platformAccounts: {
    id: string;
    platform: Platform;
    platformUserId: string;
  }[];
};

type PlanMember = {
  platform: string;
  user_id: string;
  username: string | null;
  raw_url: string | null;
  in_catalog: boolean;
  creator_profile_id: string | null;
  reach: number | null;
};
type PlanGroup = {
  contact_id: number;
  members: PlanMember[];
  name: string | null;
  country: string | null;
  gender: string | null;
  birth_year: number | null;
  bio: string | null;
};

/** Phase 3 — DuckDB join → plan.json (one row per contact that touches our catalog). */
async function buildPlan(config: Config): Promise<PlanGroup[]> {
  const path = `${config.workDir}/plan.json`;
  const sql = `
    CREATE TEMP TABLE acc AS
      SELECT platform, CAST(user_id AS VARCHAR) AS user_id, creator_profile_id
      FROM read_csv('${config.workDir}/accounts.csv', header=true, all_varchar=true);
    CREATE TEMP TABLE sp AS
      SELECT * FROM read_parquet('${config.workDir}/sp.parquet');

    -- contacts that have at least one profile matching one of OUR accounts
    CREATE TEMP TABLE coi AS
      SELECT DISTINCT sp.contact_id
      FROM sp JOIN acc ON acc.platform = sp.platform AND acc.user_id = sp.user_id
      WHERE sp.contact_id IS NOT NULL;

    -- every sibling profile of those contacts, tagged with our profile id when known
    CREATE TEMP TABLE members AS
      SELECT sp.contact_id, sp.platform, sp.user_id, sp.username, sp.raw_url, sp.reach,
             acc.creator_profile_id
      FROM sp JOIN coi USING (contact_id)
      LEFT JOIN acc ON acc.platform = sp.platform AND acc.user_id = sp.user_id;

    COPY (
      SELECT
        g.contact_id,
        g.members,
        c.name, c.country, c.gender, c.birth_year, c.bio
      FROM (
        SELECT contact_id,
          list(struct_pack(
            platform := platform,
            user_id := user_id,
            username := username,
            raw_url := raw_url,
            in_catalog := (creator_profile_id IS NOT NULL),
            creator_profile_id := creator_profile_id,
            reach := reach
          )) AS members
        FROM members
        GROUP BY contact_id
      ) g
      LEFT JOIN read_parquet('${config.workDir}/contacts.parquet') c USING (contact_id)
    ) TO '${path}' (FORMAT json);`; // newline-delimited (one contact per line)
  duckdb(sql, config.awsProfile);

  // Stream-parse line by line: with 6 platforms plan.json can exceed Node's
  // ~512MB single-string cap, so we never read the whole file into one string.
  const plan: PlanGroup[] = [];
  let mergeable = 0;
  const rl = createInterface({
    input: createReadStream(path, "utf8"),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as PlanGroup;
    plan.push(g);
    const owners = new Set(
      g.members
        .filter((m) => m.in_catalog && m.creator_profile_id)
        .map((m) => m.creator_profile_id),
    );
    if (owners.size >= 2) mergeable++;
  }
  log("info", "Built ingestion plan", {
    contactsTouchingCatalog: plan.length,
    contactsNeedingMerge: mergeable,
  });
  return plan;
}

function ageFromBirthYear(birthYear: number | null): number | null {
  if (!birthYear) return null;
  const age = new Date().getUTCFullYear() - birthYear;
  return age >= 13 && age <= 100 ? age : null;
}

type EnrichData = {
  country?: string;
  gender?: string;
  age?: number;
  bio?: string;
};

// The columns the enrichment pass reads per profile (matches the select below).
type EnrichProfileRow = {
  id: string;
  state: string;
  userId: string | null;
  mergedIntoId: string | null;
  country: string | null;
  gender: string | null;
  age: number | null;
  bio: string | null;
};

/**
 * Which EMPTY enrichment fields to fill from the contact — PURE (no DB) so the
 * apply phase can batch-read profiles and compute fills in memory instead of one
 * round-trip per contact. Only ever fills blanks; never overwrites existing data.
 */
function computeEnrichment(
  p: {
    country: string | null;
    gender: string | null;
    age: number | null;
    bio: string | null;
  },
  group: PlanGroup,
  config: Config,
): EnrichData {
  const data: EnrichData = {};
  if (!p.country && group.country?.trim())
    data.country = group.country.trim().slice(0, 100);
  if (!p.gender && group.gender?.trim())
    data.gender = group.gender.trim().toLowerCase().slice(0, 32);
  if (p.age == null) {
    const age = ageFromBirthYear(group.birth_year);
    if (age != null) data.age = age;
  }
  if (!p.bio && group.bio?.trim())
    data.bio = group.bio.trim().slice(0, config.bioMaxLen);
  return data;
}

/** Run `fn` over `items` with bounded concurrency (latency-bound work needs parallelism). */
async function runLimited<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const item = items[idx++]!;
      await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

// The apply phase is latency-bound over ~776k contacts, so read profiles in
// chunks (one findMany per chunk) instead of one findUnique per group, and run
// enrichment writes with bounded concurrency. This is the difference between a
// couple of minutes and a full day.
const READ_CHUNK = 1000;
const WRITE_CONCURRENCY = 20;
// Merges are latency-bound (~8 round-trips each) and touch DISJOINT profiles
// (a solo profile maps to exactly one contact), so they parallelize safely.
// Kept well under Prisma's default pool so we never starve connections.
const MERGE_CONCURRENCY = 8;
const MERGE_MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Neon periodically recycles connections ("Server has closed the connection")
// and a contended transaction can exceed its timeout — both transient. Since a
// merge is idempotent, retrying on a fresh connection recovers it instead of
// skipping (which is what left stragglers to mop up before).
function isRetryableDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Server has closed the connection|Transaction already closed|Can't reach database server|Timed out fetching a new connection|connection pool|ECONNRESET|Response from the Engine was empty/i.test(
    msg,
  );
}

/** Retry any idempotent DB op on transient Neon connection/timeout errors. */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = MERGE_MAX_RETRIES,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryableDbError(e) || attempt > maxRetries) throw e;
      await sleep(1000 * attempt);
    }
  }
}

/**
 * Strip NUL + control chars Postgres text can't store (the source of the
 * "unexpected end of hex escape" write failures), trim, and cap length.
 */
function sanitizeText(
  s: string | null | undefined,
  max: number,
): string | null {
  if (!s) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\x00-\x1F\x7F]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** mergeProfiles with retry on transient Neon connection/timeout errors. */
async function mergeWithRetry(
  contactId: number,
  canonicalId: string,
  otherId: string,
): Promise<Awaited<ReturnType<typeof mergeProfiles>>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mergeProfiles({
        canonicalId,
        otherId,
        signal: "contact_id",
        confidence: 1,
        decidedBy: "sh-social-ingest",
        evidence: { contactId, source: "streamhatchet-social-profiles" },
      });
    } catch (e) {
      if (!isRetryableDbError(e) || attempt > MERGE_MAX_RETRIES) throw e;
      await sleep(1000 * attempt);
    }
  }
}

type ResolvedGroup = { group: PlanGroup; ourProfileIds: string[] };

/** Phase 4 — apply merges + enrichment (batched reads, bounded-concurrency writes). */
async function applyPlan(plan: PlanGroup[], config: Config): Promise<void> {
  const groups = config.limit ? plan.slice(0, config.limit) : plan;

  // Resolve each group's distinct in-catalog profile ids up front (pure, no DB).
  const resolved: ResolvedGroup[] = [];
  for (const group of groups) {
    const ourProfileIds = [
      ...new Set(
        group.members
          .filter((m) => m.in_catalog && m.creator_profile_id)
          .map((m) => m.creator_profile_id as string),
      ),
    ];
    if (ourProfileIds.length > 0) resolved.push({ group, ourProfileIds });
  }
  const mergeGroups = resolved.filter((r) => r.ourProfileIds.length >= 2);
  const singleGroups = resolved.filter((r) => r.ourProfileIds.length === 1);

  let mergedPairs = 0;
  let claimLockedSkips = 0;
  let groupErrors = 0;

  // ---- PHASE 1: MERGES (only groups with >=2 of our profiles) ----
  // Batch-read every profile these groups touch, then decide + merge in memory.
  // Contact groups are disjoint (a solo profile maps to exactly one contact), so
  // this snapshot stays valid across the phase even as merges mutate other rows.
  const mergeIds = [...new Set(mergeGroups.flatMap((r) => r.ourProfileIds))];
  const profById = new Map<string, LiveProfile>();
  for (let i = 0; i < mergeIds.length; i += READ_CHUNK) {
    const profs: LiveProfile[] = await prisma.creatorProfile.findMany({
      where: { id: { in: mergeIds.slice(i, i + READ_CHUNK) } },
      select: {
        id: true,
        state: true,
        userId: true,
        totalFollowers: true,
        lastStreamAt: true,
        listed: true,
        mergedIntoId: true,
        platformAccounts: {
          select: { id: true, platform: true, platformUserId: true },
        },
      },
    });
    for (const p of profs) profById.set(p.id, p);
  }

  // Groups still needing enrichment after their (possible) merge.
  const enrichTargets: { group: PlanGroup; canonicalId: string }[] = [];
  let mergeProcessed = 0;

  // Run the disjoint merge groups with bounded concurrency (sequential was ~8
  // round-trips × one-at-a-time = hours; parallelism turns it into ~an hour).
  await runLimited(
    mergeGroups,
    MERGE_CONCURRENCY,
    async ({ group, ourProfileIds }) => {
      try {
        const live = ourProfileIds
          .map((id) => profById.get(id))
          .filter((p): p is LiveProfile => p != null && !p.mergedIntoId);
        if (live.length === 0) return; // all already-merged stubs — nothing to do
        let canonical = live[0]!;
        for (let i = 1; i < live.length; i++) {
          canonical = pickCanonical(canonical, live[i]!).canonical;
        }
        const canonicalId = canonical.id;
        for (const other of live) {
          if (other.id === canonicalId) continue;
          if (!config.write) {
            mergedPairs++;
            continue;
          }
          try {
            const res = await mergeWithRetry(
              group.contact_id,
              canonicalId,
              other.id,
            );
            if (res.merged) mergedPairs++;
          } catch (err) {
            // Two claimed profiles for one contact: keep both, don't abort.
            if (err instanceof ClaimLockedError) claimLockedSkips++;
            else throw err;
          }
        }
        enrichTargets.push({ group, canonicalId });
      } catch (err) {
        groupErrors++;
        log("error", "Merge group failed — skipping", {
          contactId: group.contact_id,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (++mergeProcessed % 2000 === 0) {
          log("info", "Merge progress", {
            processed: mergeProcessed,
            total: mergeGroups.length,
            mergedPairs,
            groupErrors,
          });
        }
      }
    },
  );
  log("info", "Merge phase complete", {
    write: config.write,
    mergeGroups: mergeGroups.length,
    mergedPairs,
    claimLockedSkips,
    groupErrors,
  });

  // Single-profile groups need no merge — enrich their one profile directly.
  for (const { group, ourProfileIds } of singleGroups) {
    enrichTargets.push({ group, canonicalId: ourProfileIds[0]! });
  }

  // ---- PHASE 2: ENRICHMENT (chunked reads, bounded-concurrency writes) ----
  let enrichedProfiles = 0;
  let enrichedFields = 0;
  let updateErrors = 0;
  let processed = 0;

  for (let i = 0; i < enrichTargets.length; i += READ_CHUNK) {
    const chunk = enrichTargets.slice(i, i + READ_CHUNK);
    try {
      const ids = [...new Set(chunk.map((c) => c.canonicalId))];
      const profs: EnrichProfileRow[] = await prisma.creatorProfile.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          state: true,
          userId: true,
          mergedIntoId: true,
          country: true,
          gender: true,
          age: true,
          bio: true,
        },
      });
      const byId = new Map(profs.map((p) => [p.id, p]));

      const updates: { id: string; data: EnrichData }[] = [];
      for (const { group, canonicalId } of chunk) {
        const p = byId.get(canonicalId);
        // never enrich a missing profile, a merged redirect stub, or a claimed one
        if (!p || p.mergedIntoId || isClaimLocked(p)) continue;
        const data = computeEnrichment(p, group, config);
        const fieldCount = Object.keys(data).length;
        if (fieldCount === 0) continue;
        enrichedProfiles++;
        enrichedFields += fieldCount;
        if (config.write) updates.push({ id: canonicalId, data });
      }

      if (config.write && updates.length > 0) {
        await runLimited(updates, WRITE_CONCURRENCY, async (u) => {
          try {
            await prisma.creatorProfile.update({
              where: { id: u.id },
              data: u.data,
            });
          } catch (err) {
            updateErrors++;
            if (updateErrors <= 10) {
              log("error", "Enrich update failed", {
                id: u.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        });
      }
    } catch (err) {
      // A whole chunk's read failed (e.g. dropped connection); skip + continue.
      // Idempotent, so a re-run picks these up.
      groupErrors += chunk.length;
      log("error", "Enrich chunk failed — skipping", {
        from: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    processed += chunk.length;
    log("info", "Enrich progress", {
      processed,
      total: enrichTargets.length,
      enrichedProfiles,
      updateErrors,
    });
  }

  log("info", "Apply complete", {
    write: config.write,
    contactsTouchingCatalog: resolved.length,
    mergeGroups: mergeGroups.length,
    mergedPairs,
    claimLockedSkips,
    enrichedProfiles,
    enrichedFields,
    groupErrors,
    updateErrors,
  });
}

type SocialLink = {
  platform: Platform;
  user_id: string;
  username: string | null;
  raw_url: string | null;
  reach: number | null;
};
type AttachTarget = { canonicalId: string; links: SocialLink[] };
type SocialAccountCreate = {
  creatorProfileId: string;
  platform: Platform;
  platformUserId: string;
  platformUsername: string;
  platformUrl: string | null;
  followerCount: bigint | null;
  isOAuthConnected: boolean;
  discoverySource: string;
};

function reachToBigInt(reach: number | null): bigint | null {
  if (reach == null || !Number.isFinite(reach)) return null;
  return BigInt(Math.max(0, Math.trunc(reach)));
}

/**
 * Phase 4b (--social-links) — attach IG/TikTok/X link-only PlatformAccounts to
 * already-matched creators. For each contact touching our catalog, take its best
 * (highest-reach) social profile per platform and upsert it onto the canonical
 * creator as a link-only account (handle + follower count, discoverySource set).
 * Never touches a real OAuth/tracked account. Idempotent (refreshes on re-run).
 */
async function attachSocialLinks(
  plan: PlanGroup[],
  config: Config,
): Promise<void> {
  const groups = config.limit ? plan.slice(0, config.limit) : plan;
  const socialSet = new Set<string>(SOCIAL_LINK_PLATFORMS);

  // Resolve each contact to its single canonical creator + best link per platform.
  const targets: AttachTarget[] = [];
  for (const group of groups) {
    const canonicalIds = [
      ...new Set(
        group.members
          .filter((m) => m.in_catalog && m.creator_profile_id)
          .map((m) => m.creator_profile_id as string),
      ),
    ];
    // Post-merge, a contact maps to exactly one canonical. If not (a merge was
    // skipped), don't guess which creator owns the socials — skip.
    if (canonicalIds.length !== 1) continue;
    const canonicalId = canonicalIds[0]!;

    const bestByPlatform = new Map<string, SocialLink>();
    for (const m of group.members) {
      if (!socialSet.has(m.platform) || !m.user_id) continue;
      const prev = bestByPlatform.get(m.platform);
      if (!prev || (m.reach ?? 0) > (prev.reach ?? 0)) {
        bestByPlatform.set(m.platform, {
          platform: m.platform as Platform,
          user_id: m.user_id,
          username: m.username,
          raw_url: m.raw_url,
          reach: m.reach,
        });
      }
    }
    if (bestByPlatform.size > 0)
      targets.push({ canonicalId, links: [...bestByPlatform.values()] });
  }

  log("info", "Social-link targets resolved", {
    contactsWithLinks: targets.length,
    totalLinks: targets.reduce((n, t) => n + t.links.length, 0),
  });

  let created = 0;
  let updated = 0;
  let skippedExisting = 0;
  let errors = 0;
  let processed = 0;

  for (let i = 0; i < targets.length; i += READ_CHUNK) {
    const chunk = targets.slice(i, i + READ_CHUNK);
    try {
      const canonIds = chunk.map((t) => t.canonicalId);
      // What these creators already have on the social platforms (so we never
      // clobber a real OAuth-connected account, and refresh our own links).
      const existing: {
        creatorProfileId: string;
        platform: Platform;
        discoverySource: string | null;
      }[] = await withRetry(() =>
        prisma.platformAccount.findMany({
          where: {
            creatorProfileId: { in: canonIds },
            platform: { in: SOCIAL_LINK_PLATFORMS },
          },
          select: {
            creatorProfileId: true,
            platform: true,
            discoverySource: true,
          },
        }),
      );
      const key = (cid: string, p: string) => `${cid}:${p}`;
      const existingSource = new Map<string, string | null>();
      for (const e of existing)
        existingSource.set(
          key(e.creatorProfileId, e.platform),
          e.discoverySource,
        );

      const toCreate: SocialAccountCreate[] = [];
      const toUpdate: { canonicalId: string; link: SocialLink }[] = [];
      for (const t of chunk) {
        for (const link of t.links) {
          const k = key(t.canonicalId, link.platform);
          if (!existingSource.has(k)) {
            toCreate.push({
              creatorProfileId: t.canonicalId,
              platform: link.platform,
              platformUserId: link.user_id,
              platformUsername:
                sanitizeText(link.username, 200) ?? link.user_id,
              platformUrl: normalizePlatformUrlForStorage(
                link.platform,
                sanitizeText(link.raw_url, 500),
              ),
              followerCount: reachToBigInt(link.reach),
              isOAuthConnected: false,
              discoverySource: DISCOVERY_SOURCE,
            });
          } else if (existingSource.get(k) === DISCOVERY_SOURCE) {
            toUpdate.push({ canonicalId: t.canonicalId, link });
          } else {
            skippedExisting++; // real OAuth/tracked account — never touch
          }
        }
      }

      if (!config.write) {
        created += toCreate.length;
        updated += toUpdate.length;
      } else {
        if (toCreate.length > 0) {
          // skipDuplicates absorbs the global @@unique([platform, platformUserId])
          // (a social user_id already linked to a different creator).
          const res = await withRetry<{ count: number }>(() =>
            prisma.platformAccount.createMany({
              data: toCreate,
              skipDuplicates: true,
            }),
          );
          created += res.count;
        }
        if (toUpdate.length > 0) {
          await runLimited(toUpdate, WRITE_CONCURRENCY, async (u) => {
            try {
              await withRetry(() =>
                prisma.platformAccount.update({
                  where: {
                    creatorProfileId_platform: {
                      creatorProfileId: u.canonicalId,
                      platform: u.link.platform,
                    },
                  },
                  data: {
                    platformUserId: u.link.user_id,
                    platformUsername:
                      sanitizeText(u.link.username, 200) ?? u.link.user_id,
                    platformUrl: normalizePlatformUrlForStorage(
                      u.link.platform,
                      sanitizeText(u.link.raw_url, 500),
                    ),
                    followerCount: reachToBigInt(u.link.reach),
                  },
                }),
              );
              updated++;
            } catch (err) {
              errors++;
              if (errors <= 10)
                log("error", "Social-link update failed", {
                  canonicalId: u.canonicalId,
                  platform: u.link.platform,
                  error: err instanceof Error ? err.message : String(err),
                });
            }
          });
        }
      }
    } catch (err) {
      errors += chunk.length;
      log("error", "Social-link chunk failed — skipping", {
        from: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    processed += chunk.length;
    log("info", "Social-link progress", {
      processed,
      total: targets.length,
      created,
      updated,
      skippedExisting,
      errors,
    });
  }

  log("info", "Social-link attach complete", {
    write: config.write,
    contactsWithLinks: targets.length,
    created,
    updated,
    skippedExisting,
    errors,
  });
}

async function main() {
  const config = parseConfig();
  if (!existsSync(config.workDir))
    mkdirSync(config.workDir, { recursive: true });

  const snapshot = resolveSnapshot(config);
  log("info", "Starting SH social-profiles ingestion", {
    snapshot,
    mode: config.socialLinks ? "social-links" : "merge+enrich",
    write: config.write,
    sample: config.sample,
    limit: config.limit,
    workDir: config.workDir,
  });

  if (config.skipExtract) {
    const spPath = `${config.workDir}/sp.parquet`;
    const contactsPath = `${config.workDir}/contacts.parquet`;
    if (!existsSync(spPath) || !existsSync(contactsPath)) {
      throw new Error(
        `--skip-extract needs ${spPath} and ${contactsPath} to already exist. Run once without --skip-extract first.`,
      );
    }
    log("info", "Skipping S3 extract — reusing local parquets", {
      spPath,
      contactsPath,
    });
  } else {
    extractSocialProfiles(config, snapshot);
    extractContacts(config, snapshot);
  }
  await exportOurAccounts(config);
  const plan = await buildPlan(config);

  if (config.socialLinks) {
    await attachSocialLinks(plan, config);
  } else {
    await applyPlan(plan, config);
  }

  if (!config.write) {
    log("info", "Dry run complete — pass --write to apply.");
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  log("error", "Fatal", {
    error: err instanceof Error ? err.message : String(err),
  });
  await prisma.$disconnect();
  process.exit(1);
});
