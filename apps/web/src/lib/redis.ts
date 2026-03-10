import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Per-platform API rate limiters
// These reflect actual documented API limits

// Twitch Helix: 800 requests per 60s (with app access token)
export const twitchApiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(800, "60 s"),
  prefix: "ratelimit:twitch",
})

// YouTube Data API v3: 10,000 quota units per day
export const youtubeApiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10000, "86400 s"),
  prefix: "ratelimit:youtube",
})

// Instagram Graph API: ~200 calls per hour per user token
export const instagramApiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, "3600 s"),
  prefix: "ratelimit:instagram",
})

// TikTok API: ~100 per minute
export const tiktokApiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "60 s"),
  prefix: "ratelimit:tiktok",
})

// X API v2 (Basic tier): 500 requests per 15-minute window
export const xApiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, "900 s"),
  prefix: "ratelimit:x",
})

// Kick API: estimated ~100 per minute
export const kickApiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "60 s"),
  prefix: "ratelimit:kick",
})
