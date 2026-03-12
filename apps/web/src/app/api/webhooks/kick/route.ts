import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("kick-webhook");

// Kick's webhook system is not yet publicly documented with a standard
// signature verification scheme. This handler validates request shape,
// logs event metadata, and safely rejects unverifiable payloads.

async function verifyKickSignature(
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.KICK_WEBHOOK_SECRET;

  // If no secret is configured, we cannot verify signatures
  if (!secret) {
    log.warn("KICK_WEBHOOK_SECRET not configured — rejecting webhook");
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  // Use HMAC-SHA256 verification (anticipated Kick standard)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Strip any prefix (e.g. "sha256=")
  const receivedSig = signatureHeader.replace(/^sha256=/, "");

  if (expectedSignature.length !== receivedSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    mismatch |= expectedSignature.charCodeAt(i) ^ receivedSig.charCodeAt(i);
  }
  return mismatch === 0;
}

type KickWebhookPayload = {
  event_type?: string;
  data?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Validate signature
  const signatureHeader =
    request.headers.get("x-kick-signature") ??
    request.headers.get("x-signature");

  const valid = await verifyKickSignature(body, signatureHeader);
  if (!valid) {
    log.warn("Invalid or missing Kick webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: KickWebhookPayload;
  try {
    payload = JSON.parse(body) as KickWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.event_type) {
    return NextResponse.json({ error: "Missing event_type" }, { status: 400 });
  }

  log.info(
    {
      eventType: payload.event_type,
      hasData: !!payload.data,
    },
    "Kick webhook received",
  );

  // Process known event types
  switch (payload.event_type) {
    case "stream.start":
    case "stream.stop":
    case "channel.update":
      log.info(
        { eventType: payload.event_type, data: payload.data },
        "Kick stream event processed",
      );
      break;

    default:
      log.info({ eventType: payload.event_type }, "Unhandled Kick event type");
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
