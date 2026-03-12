import { NextResponse } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { createLogger } from "@/lib/logger";

const log = createLogger("report-lead");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Minimum time between submissions from the same email (1 hour)
const DUPLICATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "report-lead", {
    limit: 10,
    window: "3600 s",
  });
  if (rateLimited) return rateLimited;

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      company?: string;
    };

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const company = body.company?.trim();

    if (!name || !email || !company) {
      return NextResponse.json(
        { data: null, error: "Name, email, and company are required" },
        { status: 400 },
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { data: null, error: "Invalid email address" },
        { status: 400 },
      );
    }

    // Duplicate protection: check for recent submission from same email
    const recentSubmission = await prisma.reportLead.findFirst({
      where: {
        email,
        createdAt: {
          gte: new Date(Date.now() - DUPLICATE_WINDOW_MS),
        },
      },
      select: { id: true },
    });

    if (recentSubmission) {
      // Return success to avoid leaking info about existing submissions
      log.info(
        { emailDomain: email.split("@")[1] ?? "unknown" },
        "Duplicate lead submission suppressed",
      );
      return NextResponse.json({
        data: { submitted: true },
        meta: {},
      });
    }

    await prisma.reportLead.create({
      data: { name, email, company },
    });

    log.info(
      {
        emailDomain: email.split("@")[1] ?? "unknown",
        timestamp: new Date().toISOString(),
      },
      "Report lead submitted",
    );

    return NextResponse.json({
      data: { submitted: true },
      meta: {},
    });
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid request body" },
      { status: 400 },
    );
  }
}
