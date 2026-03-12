import { NextResponse } from "next/server";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const email = body.email?.trim();
    const company = body.company?.trim();

    if (!name || !email || !company) {
      return NextResponse.json(
        { error: "Name, email, and company are required" },
        { status: 400 },
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    // TODO: Store in DB (ReportLead model) or forward to Stream Hatchet API.
    // Keep logs non-PII for compliance and operational safety.
    console.log("[Report Lead]", {
      emailDomain: email.split("@")[1] ?? "unknown",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
