import { NextResponse, after } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { sendContactNotification } from "@/server/services/contact-notifications";
import { CONTACT_TOPICS } from "@/lib/constants/contact";
import { createLogger } from "@/lib/logger";

const log = createLogger("contact");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "contact", {
    limit: 10,
    window: "3600 s",
  });
  if (rateLimited) return rateLimited;

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      company?: string;
      topic?: string;
      message?: string;
    };

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const company = body.company?.trim() || null;
    const topic = body.topic?.trim();
    const message = body.message?.trim();

    if (!name || !email || !topic || !message) {
      return NextResponse.json(
        { data: null, error: "Name, email, topic, and message are required" },
        { status: 400 },
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { data: null, error: "Invalid email address" },
        { status: 400 },
      );
    }

    if (!(CONTACT_TOPICS as readonly string[]).includes(topic)) {
      return NextResponse.json(
        { data: null, error: "Invalid topic" },
        { status: 400 },
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { data: null, error: "Message is too long" },
        { status: 400 },
      );
    }

    // Same ReportLead table used by report quotes and industry inquiries
    // (details is JSON), tagged with a `kind` discriminator — the message is
    // persisted even if email delivery fails.
    await prisma.reportLead.create({
      data: {
        name,
        email,
        company: company ?? "—",
        details: { kind: "contact", topic, message },
      },
    });

    // Deliver to the team inbox off the response's critical path. Failures
    // are logged inside the service and never block the saved message.
    after(() =>
      sendContactNotification({ name, email, company, topic, message }),
    );

    log.info(
      {
        topic,
        emailDomain: email.split("@")[1] ?? "unknown",
        timestamp: new Date().toISOString(),
      },
      "Contact form submitted",
    );

    return NextResponse.json({ data: { submitted: true }, meta: {} });
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid request body" },
      { status: 400 },
    );
  }
}
