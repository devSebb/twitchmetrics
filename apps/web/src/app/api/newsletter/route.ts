import { NextResponse, after } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { addNewsletterContact } from "@/server/services/newsletter";
import { createLogger } from "@/lib/logger";

const log = createLogger("newsletter");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_EMAIL_LENGTH = 320;

export async function POST(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "newsletter", {
    limit: 5,
    window: "3600 s",
  });
  if (rateLimited) return rateLimited;

  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { data: null, error: "Email is required" },
        { status: 400 },
      );
    }

    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { data: null, error: "Invalid email address" },
        { status: 400 },
      );
    }

    // Same ReportLead table used by contact, report quotes, and industry
    // inquiries (details is JSON), tagged with a `kind` discriminator — the
    // signup is persisted even if the Resend call fails.
    await prisma.reportLead.create({
      data: {
        name: "Newsletter subscriber",
        email,
        company: "—",
        details: { kind: "newsletter" },
      },
    });

    // Push to the Resend audience off the response's critical path. Failures
    // are logged inside the service and never block the saved signup.
    after(() => addNewsletterContact(email));

    log.info(
      {
        emailDomain: email.split("@")[1] ?? "unknown",
        timestamp: new Date().toISOString(),
      },
      "Newsletter signup",
    );

    return NextResponse.json({ data: { subscribed: true }, meta: {} });
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid request body" },
      { status: 400 },
    );
  }
}
