import { NextResponse, after } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { sendReportInquiryNotifications } from "@/server/services/report-notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("report-inquiry");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "report-inquiry", {
    limit: 10,
    window: "3600 s",
  });
  if (rateLimited) return rateLimited;

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      company?: string;
      message?: string;
    };

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const company = body.company?.trim();
    const message = body.message?.trim();

    if (!name || !email || !company || !message) {
      return NextResponse.json(
        { data: null, error: "Name, email, company, and message are required" },
        { status: 400 },
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { data: null, error: "Invalid email address" },
        { status: 400 },
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { data: null, error: "Message is too long" },
        { status: 400 },
      );
    }

    // Stored in the same ReportLead table as report quotes (details is JSON),
    // tagged with a `kind` discriminator so inquiries stay distinguishable.
    await prisma.reportLead.create({
      data: {
        name,
        email,
        company,
        details: { kind: "industry-inquiry", message },
      },
    });

    // Alert sales + confirm to the customer, off the response's critical path.
    // Failures are logged inside the service and never block the saved lead.
    after(() =>
      sendReportInquiryNotifications({ name, email, company, message }),
    );

    log.info(
      {
        emailDomain: email.split("@")[1] ?? "unknown",
        timestamp: new Date().toISOString(),
      },
      "Report inquiry submitted",
    );

    return NextResponse.json({ data: { submitted: true }, meta: {} });
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid request body" },
      { status: 400 },
    );
  }
}
