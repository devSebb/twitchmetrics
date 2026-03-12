import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { prisma, type ClaimMethod } from "@twitchmetrics/database";

type GuardResult = { allowed: true } | { allowed: false; reason: string };

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const ipLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "3600 s"),
      prefix: "ratelimit:claims:ip",
    })
  : null;

export async function validateClaimAttempt(
  userId: string,
  creatorProfileId: string,
  method: ClaimMethod,
  clientIp: string,
): Promise<GuardResult> {
  console.log("[Claim Attempt]", {
    userId,
    creatorProfileId,
    method,
    clientIp,
    timestamp: new Date().toISOString(),
  });

  if (ipLimiter) {
    try {
      const result = await ipLimiter.limit(clientIp || "unknown");
      if (!result.success) {
        return {
          allowed: false,
          reason: "Too many claim attempts from this IP",
        };
      }
    } catch {
      // Fail open if rate limiter backend is unavailable.
    }
  }

  const pendingClaimsForUser = await prisma.claimRequest.count({
    where: {
      userId,
      status: "pending",
    },
  });
  if (pendingClaimsForUser >= 3) {
    return {
      allowed: false,
      reason: "You already have 3 active pending claims",
    };
  }

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: {
      id: true,
      userId: true,
      totalFollowers: true,
      state: true,
    },
  });
  if (!creatorProfile) {
    return { allowed: false, reason: "Creator profile not found" };
  }

  if (creatorProfile.userId === userId) {
    return { allowed: false, reason: "You already own this profile" };
  }

  const existingPendingClaim = await prisma.claimRequest.findFirst({
    where: {
      creatorProfileId,
      status: "pending",
    },
    select: { id: true },
  });
  if (existingPendingClaim) {
    return {
      allowed: false,
      reason: "This profile already has a pending claim",
    };
  }

  const isHighValue = Number(creatorProfile.totalFollowers) > 100_000;
  if (isHighValue && method !== "oauth" && method !== "cross_platform") {
    return {
      allowed: false,
      reason: "High-value profiles require OAuth verification",
    };
  }

  return { allowed: true };
}
