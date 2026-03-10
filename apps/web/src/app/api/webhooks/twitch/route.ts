import { NextResponse } from "next/server"

// TODO: implement Twitch EventSub webhook handler
// - Verify webhook signature using TWITCH_EVENTSUB_SECRET
// - Handle subscription verification challenge
// - Process events: stream.online, stream.offline, channel.update
export async function POST(request: Request) {
  // TODO: implement
  return NextResponse.json({ received: true })
}
