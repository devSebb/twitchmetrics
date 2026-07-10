/**
 * StreamHatchet Identity Resolver (driver)
 *
 * Generates cross-platform identity candidates, persists them as `proposed`
 * IdentityLinks, then auto-merges the ones that clear the confidence threshold
 * and don't touch a claimed profile. Everything below the threshold (and any
 * candidate whose absorbed side is claimed) is left `proposed` for human review.
 *
 * Dry-run by default. This is the "run it once" initial bulk pass; the daily
 * incremental can call the same generateIdentityCandidates/mergeProfiles.
 *
 * Usage:
 *   pnpm worker:streamhatchet-identity                          # dry run
 *   pnpm worker:streamhatchet-identity -- --write
 *   pnpm worker:streamhatchet-identity -- --write --auto-merge-threshold 0.85
 *   pnpm worker:streamhatchet-identity -- --platform kick --limit 20000 --write
 */

import { PrismaClient } from "@prisma/client";
import {
  generateIdentityCandidates,
  persistCandidates,
} from "../apps/web/src/server/services/identity/resolver";
import {
  ClaimLockedError,
  mergeProfiles,
} from "../apps/web/src/server/services/identity/merge";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

function argValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function parseFloatArg(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntArg(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: unknown,
) {
  const ts = new Date().toISOString();
  const extra = data
    ? ` ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`
    : "";
  console[level](`[${ts}] [streamhatchet-identity] ${message}${extra}`);
}

async function main() {
  const write = args.includes("--write");
  const autoMergeThreshold = parseFloatArg(
    argValue("--auto-merge-threshold"),
    0.85,
  );
  const platform = argValue("--platform");
  const limit = parseIntArg(argValue("--limit"));

  log("info", "Starting identity resolution", {
    write,
    autoMergeThreshold,
    platform: platform ?? "all",
    limit: limit ?? null,
  });

  const candidates = await generateIdentityCandidates({
    catalogSources: ["streamhatchet"],
    ...(platform ? { platforms: [platform] } : {}),
    ...(limit ? { limit } : {}),
  });

  const autoMergeable = candidates.filter(
    (c) => c.confidence >= autoMergeThreshold,
  );

  log("info", "Candidate generation complete", {
    candidates: candidates.length,
    autoMergeable: autoMergeable.length,
    reviewQueue: candidates.length - autoMergeable.length,
    sample: candidates.slice(0, 15).map((c) => ({
      signal: c.signal,
      confidence: Number(c.confidence.toFixed(2)),
      handle: c.evidence.handle,
      platforms: c.evidence.platforms,
      corroboration: {
        name: c.evidence.displayNameMatch,
        country: c.evidence.countryMatch,
        bio: c.evidence.bioReference,
      },
    })),
  });

  if (!write) {
    log("info", "Dry run complete; pass --write to persist + auto-merge.");
    return;
  }

  const persisted = await persistCandidates(candidates);
  log("info", "Persisted proposed links", { persisted });

  let merged = 0;
  let claimSkipped = 0;
  let failed = 0;

  for (const c of autoMergeable) {
    try {
      const result = await mergeProfiles({
        canonicalId: c.canonicalId,
        otherId: c.otherId,
        signal: c.signal,
        confidence: c.confidence,
        decidedBy: "system",
        evidence: c.evidence,
      });
      if (result.merged) merged++;
    } catch (error) {
      if (error instanceof ClaimLockedError) {
        claimSkipped++; // left proposed for review
        continue;
      }
      failed++;
      log("warn", "Merge failed", {
        canonicalId: c.canonicalId,
        otherId: c.otherId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log("info", "Identity resolution complete", {
    persisted,
    merged,
    claimSkipped,
    failed,
    leftForReview: candidates.length - merged,
  });
}

main()
  .catch((error) => {
    log("error", "Identity resolution failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
