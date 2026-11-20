import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createLogger } from "@/lib/logger";
import {
  dispatchSlot,
  isDispatchSlot,
} from "@/server/services/github-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("cron-dispatch");

/**
 * Called by Vercel Cron (vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`. Starts the slot's GitHub workflow.
 * A failed dispatch answers 502 so it shows as a failed cron in Vercel, and
 * goes to Sentry: nothing else notices a job that was never started until
 * the daily watchdog.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slot: string }> },
) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slot } = await params;
  if (!isDispatchSlot(slot)) {
    return NextResponse.json({ error: "Unknown slot" }, { status: 404 });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    log.error({ slot }, "GITHUB_DISPATCH_TOKEN is not configured");
    return NextResponse.json(
      { error: "GITHUB_DISPATCH_TOKEN is not configured" },
      { status: 500 },
    );
  }

  const result = await dispatchSlot(slot, token);
  if (!result.ok) {
    log.error(result, "GitHub dispatch failed");
    Sentry.captureMessage(
      `GitHub dispatch failed: ${slot} (${result.status})`,
      "error",
    );
    return NextResponse.json(result, { status: 502 });
  }
  log.info(result, "GitHub workflow dispatched");
  return NextResponse.json(result);
}
