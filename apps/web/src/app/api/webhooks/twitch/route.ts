import { NextResponse } from "next/server";

// TODO: implement Twitch EventSub webhook handler
// - Verify webhook signature using TWITCH_EVENTSUB_SECRET
// - Handle subscription verification challenge
// - Process events: stream.online, stream.offline, channel.update
export async function POST(_request: Request) {
  // Safety-first stub: explicitly reject until signature validation is implemented.
  // TODO: verify Twitch EventSub signature headers before processing any payload.
  return NextResponse.json(
    { error: "Twitch webhook handler is not implemented" },
    { status: 501 },
  );
}
