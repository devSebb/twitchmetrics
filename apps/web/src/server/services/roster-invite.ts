import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const INVITE_TOKEN_BYTES = 32;
export const INVITE_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

/**
 * Hash a raw invite token for DB storage / lookup.
 *
 * The raw token only ever appears in URLs (and in the immediate response of
 * inviteCreator / regenerateInvite). The DB stores only this hash, so a DB
 * leak does not expose live invite links.
 */
export function hashInviteToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generate a fresh invite token. Returns the raw token (URL-safe base64), its
 * SHA-256 hash for DB storage, and the absolute expiry timestamp.
 *
 * Callers must persist only `hash` and `expiresAt`; `token` is returned exactly
 * once and must be surfaced inline in the response that triggers it.
 */
export function generateInviteToken(): {
  token: string;
  hash: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
  const hash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  return { token, hash, expiresAt };
}

function getAppOrigin(): string {
  const configuredUrl =
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL;

  if (configuredUrl) {
    const url = configuredUrl.startsWith("http")
      ? configuredUrl
      : `https://${configuredUrl}`;
    return new URL(url).origin;
  }

  return "http://localhost:3000";
}

export function buildInviteUrl(rawToken: string): string {
  const origin = getAppOrigin();
  const url = new URL(`/invite/roster/${rawToken}`, origin);
  return url.toString();
}

/* ------------------------------------------------------------------ */
/*  Rate limiting — env-safe, fail-open                                */
/*  Mirrors apps/web/src/server/services/claim-guards.ts:7-49 so       */
/*  local/dev without UPSTASH_* env vars never crashes.                */
/* ------------------------------------------------------------------ */

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export const inviteCreationLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "3600 s"),
      prefix: "ratelimit:invite:create",
    })
  : null;

export const inviteAcceptLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "3600 s"),
      prefix: "ratelimit:invite:accept",
    })
  : null;

export const inviteLookupLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "3600 s"),
      prefix: "ratelimit:invite:lookup",
    })
  : null;

/**
 * Apply a rate limiter with the fail-open pattern. Returns true if the action
 * is allowed; false if the limit was exceeded. Fails open (returns true) when
 * the limiter isn't configured or the backend is unreachable.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  key: string,
): Promise<boolean> {
  if (!limiter) return true;
  try {
    const result = await limiter.limit(key);
    return result.success;
  } catch {
    return true;
  }
}
