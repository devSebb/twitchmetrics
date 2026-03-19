import { NextResponse } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

export async function GET() {
  const start = Date.now();

  let dbHealthy = false;
  let redisHealthy = false;

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbHealthy = true;
  } catch {
    // DB unreachable
  }

  // Check Redis connectivity (Upstash REST client — use ping)
  try {
    const result = await redis.ping();
    redisHealthy = result === "PONG";
  } catch {
    // Redis unreachable
  }

  const latencyMs = Date.now() - start;
  const allHealthy = dbHealthy && redisHealthy;

  return NextResponse.json(
    {
      status: allHealthy ? "ok" : "degraded",
      db: dbHealthy,
      redis: redisHealthy,
      latencyMs,
    },
    { status: allHealthy ? 200 : 503 },
  );
}
