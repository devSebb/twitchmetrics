import { NextResponse } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";

const log = createLogger("twitch-webhook");

const TWITCH_MESSAGE_ID_HEADER = "twitch-eventsub-message-id";
const TWITCH_MESSAGE_TIMESTAMP_HEADER = "twitch-eventsub-message-timestamp";
const TWITCH_MESSAGE_SIGNATURE_HEADER = "twitch-eventsub-message-signature";
const TWITCH_MESSAGE_TYPE_HEADER = "twitch-eventsub-message-type";

const MESSAGE_TYPE_VERIFICATION = "webhook_callback_verification";
const MESSAGE_TYPE_NOTIFICATION = "notification";
const MESSAGE_TYPE_REVOCATION = "revocation";

// Reject messages older than 10 minutes to prevent replay attacks
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

async function verifyTwitchSignature(
  body: string,
  messageId: string,
  timestamp: string,
  signature: string,
): Promise<boolean> {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) {
    log.warn("TWITCH_EVENTSUB_SECRET not configured — rejecting webhook");
    return false;
  }

  // Check message timestamp to prevent replay attacks
  const messageAge = Date.now() - new Date(timestamp).getTime();
  if (messageAge > MAX_MESSAGE_AGE_MS) {
    log.warn({ messageAge, messageId }, "Rejecting stale webhook message");
    return false;
  }

  const hmacMessage = messageId + timestamp + body;
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
    encoder.encode(hmacMessage),
  );

  const expectedSignature =
    "sha256=" +
    Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Constant-time comparison
  if (expectedSignature.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    mismatch |= expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

type TwitchEventSubPayload = {
  subscription: {
    id: string;
    type: string;
    version: string;
    condition: Record<string, string>;
  };
  event?: Record<string, unknown>;
  challenge?: string;
};

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const messageId = request.headers.get(TWITCH_MESSAGE_ID_HEADER);
  const timestamp = request.headers.get(TWITCH_MESSAGE_TIMESTAMP_HEADER);
  const signature = request.headers.get(TWITCH_MESSAGE_SIGNATURE_HEADER);
  const messageType = request.headers.get(TWITCH_MESSAGE_TYPE_HEADER);

  if (!messageId || !timestamp || !signature || !messageType) {
    return NextResponse.json(
      { error: "Missing required Twitch EventSub headers" },
      { status: 400 },
    );
  }

  // Verify HMAC signature
  const valid = await verifyTwitchSignature(
    body,
    messageId,
    timestamp,
    signature,
  );
  if (!valid) {
    log.warn({ messageId }, "Invalid webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: TwitchEventSubPayload;
  try {
    payload = JSON.parse(body) as TwitchEventSubPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle verification challenge
  if (messageType === MESSAGE_TYPE_VERIFICATION) {
    if (!payload.challenge) {
      return NextResponse.json({ error: "Missing challenge" }, { status: 400 });
    }
    log.info(
      { subscriptionType: payload.subscription.type },
      "EventSub subscription verified",
    );
    return new Response(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Handle revocation
  if (messageType === MESSAGE_TYPE_REVOCATION) {
    log.warn(
      {
        subscriptionId: payload.subscription.id,
        subscriptionType: payload.subscription.type,
      },
      "EventSub subscription revoked",
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Handle notifications
  if (messageType === MESSAGE_TYPE_NOTIFICATION && payload.event) {
    const eventType = payload.subscription.type;
    const event = payload.event;

    log.info(
      {
        eventType,
        subscriptionId: payload.subscription.id,
        broadcasterId: event.broadcaster_user_id,
      },
      "EventSub notification received",
    );

    try {
      switch (eventType) {
        case "stream.online": {
          const broadcasterId = event.broadcaster_user_id as string | undefined;
          if (broadcasterId) {
            await prisma.platformAccount.updateMany({
              where: {
                platform: "twitch",
                platformUserId: broadcasterId,
              },
              data: { lastSyncedAt: new Date() },
            });
          }
          break;
        }

        case "stream.offline": {
          const broadcasterId = event.broadcaster_user_id as string | undefined;
          if (broadcasterId) {
            await prisma.platformAccount.updateMany({
              where: {
                platform: "twitch",
                platformUserId: broadcasterId,
              },
              data: { lastSyncedAt: new Date() },
            });
          }
          break;
        }

        case "channel.update": {
          // Log the update for future processing (game changes, title changes)
          log.info(
            {
              broadcasterId: event.broadcaster_user_id,
              title: event.title,
              categoryName: event.category_name,
            },
            "Channel update received",
          );
          break;
        }

        default:
          log.info({ eventType }, "Unhandled EventSub event type");
      }
    } catch (err) {
      log.error({ err, eventType }, "Error processing EventSub event");
      // Return 200 to acknowledge receipt even on processing errors
      // to prevent Twitch from retrying indefinitely
    }

    return NextResponse.json({ received: true }, { status: 200 });
  }

  return NextResponse.json({ error: "Unknown message type" }, { status: 400 });
}
