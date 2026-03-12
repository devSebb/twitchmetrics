import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@twitchmetrics/database";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(50),
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "register", {
    limit: 5,
    window: "3600 s",
  });
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid registration payload" },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true });
}
