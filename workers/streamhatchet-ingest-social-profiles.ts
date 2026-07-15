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
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { prisma, type Platform } from "@twitchmetrics/database";
import {
  ClaimLockedError,
  isClaimLocked,
  mergeProfiles,
  pickCanonical,
} from "../apps/web/src/server/services/identity/merge";

const args = process.argv.slice(2);
const BUCKET = "streamhatchet-social-profiles-data";
const EXPORT_PREFIX = "PostgreSQL-export";
const TABLE_SUBPATH = "partner_evaluator";

// SH social_profiles.type -> our Platform enum. Only these three are ingested.
const TYPE_TO_PLATFORM: Record<string, Platform> = {
  TwitchProfile: "twitch",
  YoutubeProfile: "youtube",
  KickProfile: "kick",
};
const SP_TYPES = Object.keys(TYPE_TO_PLATFORM);

type Config = {
  snapshot: string | null; // explicit snapshot folder, else latest daily
  write: boolean;
  sample: boolean; // read only the first parquet part per table (fast dev)
  limit: number | null; // cap contact groups in the apply phase
  workDir: string;
  awsProfile: string;
  bioMaxLen: number;
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
  const sql = `${S3_SETUP(config.awsProfile)}
    COPY (
      SELECT
        TRY_CAST(contact_id AS BIGINT)      AS contact_id,
        type,
        CASE type
          WHEN 'TwitchProfile'  THEN 'twitch'
          WHEN 'YoutubeProfile' THEN 'youtube'
          WHEN 'KickProfile'    THEN 'kick'
        END                                  AS platform,
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
  log("info", "Extracted social_profiles (safe cols, 3 platforms)", {
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

/** Phase 2 — export our PlatformAccount rows for the 3 platforms to CSV for the join. */
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
      creatorProfileId: string;
    }[] = await prisma.platformAccount.findMany({
      where: { platform: { in: platforms } },
      select: {
        id: true,
        platform: true,
        platformUserId: true,
        creatorProfileId: true,
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
      lines.push(`${r.platform},${uid},${r.creatorProfileId}`);
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
function buildPlan(config: Config): PlanGroup[] {
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
      SELECT sp.contact_id, sp.platform, sp.user_id, sp.username, sp.reach,
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
            in_catalog := (creator_profile_id IS NOT NULL),
            creator_profile_id := creator_profile_id,
            reach := reach
          )) AS members
        FROM members
        GROUP BY contact_id
      ) g
      LEFT JOIN read_parquet('${config.workDir}/contacts.parquet') c USING (contact_id)
    ) TO '${path}' (FORMAT json, ARRAY true);`;
  duckdb(sql, config.awsProfile);
  const plan = JSON.parse(readFileSync(path, "utf8")) as PlanGroup[];
  const mergeable = plan.filter(
    (g) =>
      new Set(
        g.members
          .filter((m) => m.in_catalog && m.creator_profile_id)
          .map((m) => m.creator_profile_id),
      ).size >= 2,
  ).length;
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

/** Fill EMPTY enrichment fields on a non-claim-locked profile. */
async function enrichProfile(
  profileId: string,
  group: PlanGroup,
  config: Config,
): Promise<string[]> {
  const p = await prisma.creatorProfile.findUnique({
    where: { id: profileId },
    select: {
      state: true,
      userId: true,
      country: true,
      gender: true,
      age: true,
      bio: true,
    },
  });
  if (!p || isClaimLocked(p)) return []; // never overwrite a claimed/owned profile
  const data: {
    country?: string;
    gender?: string;
    age?: number;
    bio?: string;
  } = {};
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
  const fields = Object.keys(data);
  if (fields.length > 0 && config.write) {
    await prisma.creatorProfile.update({ where: { id: profileId }, data });
  }
  return fields;
}

/** Phase 4 — apply merges + enrichment. */
async function applyPlan(plan: PlanGroup[], config: Config): Promise<void> {
  const groups = config.limit ? plan.slice(0, config.limit) : plan;
  let mergedPairs = 0;
  let claimLockedSkips = 0;
  let enrichedProfiles = 0;
  let enrichedFields = 0;

  for (const group of groups) {
    const ourProfileIds = [
      ...new Set(
        group.members
          .filter((m) => m.in_catalog && m.creator_profile_id)
          .map((m) => m.creator_profile_id as string),
      ),
    ];
    if (ourProfileIds.length === 0) continue;

    let canonicalId = ourProfileIds[0]!;

    // ---- MERGE: fold multiple of our profiles that share this contact ----
    if (ourProfileIds.length >= 2) {
      const profiles: LiveProfile[] = await prisma.creatorProfile.findMany({
        where: { id: { in: ourProfileIds } },
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
      // skip any already-merged stubs; pick the canonical survivor
      const live = profiles.filter((p) => !p.mergedIntoId);
      if (live.length >= 2) {
        let canonical = live[0]!;
        for (let i = 1; i < live.length; i++) {
          canonical = pickCanonical(canonical, live[i]!).canonical;
        }
        canonicalId = canonical.id;
        for (const other of live) {
          if (other.id === canonicalId) continue;
          if (!config.write) {
            log("info", "[dry-run] would merge", {
              contactId: group.contact_id,
              canonicalId,
              otherId: other.id,
            });
            mergedPairs++;
            continue;
          }
          try {
            const res = await mergeProfiles({
              canonicalId,
              otherId: other.id,
              signal: "contact_id",
              confidence: 1,
              decidedBy: "sh-social-ingest",
              evidence: {
                contactId: group.contact_id,
                source: "streamhatchet-social-profiles",
              },
            });
            if (res.merged) mergedPairs++;
          } catch (err) {
            if (err instanceof ClaimLockedError) {
              claimLockedSkips++;
              // canonical should be the claimed one; if the OTHER is claimed we keep both
              log("warn", "claim-locked, kept separate", {
                contactId: group.contact_id,
                otherId: other.id,
              });
            } else {
              throw err;
            }
          }
        }
      } else if (live.length === 1) {
        canonicalId = live[0]!.id;
      }
    }

    // ---- ENRICH the canonical/only profile from the contact ----
    const fields = await enrichProfile(canonicalId, group, config);
    if (fields.length > 0) {
      enrichedProfiles++;
      enrichedFields += fields.length;
      if (!config.write) {
        log("info", "[dry-run] would enrich", {
          profileId: canonicalId,
          fields,
        });
      }
    }
  }

  log("info", "Apply complete", {
    write: config.write,
    contactsProcessed: groups.length,
    mergedPairs,
    claimLockedSkips,
    enrichedProfiles,
    enrichedFields,
  });
}

async function main() {
  const config = parseConfig();
  if (!existsSync(config.workDir))
    mkdirSync(config.workDir, { recursive: true });

  const snapshot = resolveSnapshot(config);
  log("info", "Starting SH social-profiles ingestion", {
    snapshot,
    write: config.write,
    sample: config.sample,
    limit: config.limit,
    workDir: config.workDir,
  });

  extractSocialProfiles(config, snapshot);
  extractContacts(config, snapshot);
  await exportOurAccounts(config);
  const plan = buildPlan(config);
  await applyPlan(plan, config);

  if (!config.write) {
    log(
      "info",
      "Dry run complete — pass --write to apply merges + enrichment.",
    );
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
