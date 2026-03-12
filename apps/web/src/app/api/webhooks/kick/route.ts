import { NextResponse } from "next/server";

// TODO: implement Kick webhook handler
export async function POST(_request: Request) {
  // Safety-first stub: explicitly reject until signature validation is implemented.
  // TODO: verify Kick webhook signatures before processing any payload.
  return NextResponse.json(
    { error: "Kick webhook handler is not implemented" },
    { status: 501 },
  );
}
