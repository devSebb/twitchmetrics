import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import {
  PASSWORD_RESET_REQUEST_MESSAGE,
  requestPasswordReset,
} from "@/server/services/password-reset";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const responseBody = {
  success: true,
  message: PASSWORD_RESET_REQUEST_MESSAGE,
};

export async function POST(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "forgot-password", {
    limit: 5,
    window: "900 s",
  });
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    await requestPasswordReset({
      email: parsed.data.email,
      request,
    });
  } catch (error) {
    console.error("[auth] Failed to send password reset email", { error });
  }

  return NextResponse.json(responseBody);
}
