import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { resetPasswordWithToken } from "@/server/services/password-reset";

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "reset-password", {
    limit: 10,
    window: "900 s",
  });
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid or expired reset link." },
      { status: 400 },
    );
  }

  const reset = await resetPasswordWithToken({
    token: parsed.data.token,
    password: parsed.data.password,
  });

  if (!reset) {
    return NextResponse.json(
      { error: "Invalid or expired reset link." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Your password has been reset. You can now log in.",
  });
}
