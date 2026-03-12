import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type RateLimitConfig = {
  limit: number;
  window: `${number} s`;
};

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiterCache = new Map<string, Ratelimit>();

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function getLimiter(key: string, config: RateLimitConfig): Ratelimit | null {
  if (!redis) return null;

  const cacheKey = `${key}:${config.limit}:${config.window}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    prefix: `ratelimit:public:${key}`,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

export async function rateLimitOrResponse(
  request: Request,
  key: string,
  config: RateLimitConfig,
) {
  const limiter = getLimiter(key, config);
  if (!limiter) return null;

  try {
    const identifier = getClientIp(request);
    const result = await limiter.limit(identifier);

    if (!result.success) {
      return NextResponse.json(
        { data: null, meta: {}, error: "Too many requests" },
        { status: 429 },
      );
    }
  } catch {
    // Fail open to avoid causing an outage when rate limiter provider is unavailable.
    return null;
  }

  return null;
}
