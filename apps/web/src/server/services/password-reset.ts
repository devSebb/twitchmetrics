import crypto from "node:crypto";
import { hash as hashPassword } from "bcryptjs";
import { prisma } from "@twitchmetrics/database";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_RESET_REQUESTS_PER_HOUR = 3;
const EMAIL_FROM = "TwitchMetrics <noreply@twitchmetrics.net>";

export const PASSWORD_RESET_REQUEST_MESSAGE =
  "If a TwitchMetrics account exists for that email, a reset link has been sent.";

export function normalizeResetEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashRequestMetadata(value: string | null): string | null {
  if (!value) return null;

  const secret =
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "twitchmetrics-password-reset";

  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
}

function getAppOrigin(request: Request): string {
  const configuredUrl =
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL;

  if (configuredUrl) {
    const url = configuredUrl.startsWith("http")
      ? configuredUrl
      : `https://${configuredUrl}`;
    return new URL(url).origin;
  }

  return new URL(request.url).origin;
}

async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing RESEND_API_KEY for password reset email delivery.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject: "Reset your TwitchMetrics password",
      html: `
        <div style="font-family: Arial, sans-serif; background: #2B2D31; color: #DBDEE1; padding: 24px;">
          <h2 style="margin: 0 0 12px; color: #F2F3F5;">Reset your password</h2>
          <p style="margin: 0 0 20px; color: #949BA4;">Use this secure link to reset your TwitchMetrics account password. The link expires in 30 minutes.</p>
          <a href="${resetUrl}" style="display: inline-block; background: #E32C19; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
            Reset Password
          </a>
          <p style="margin: 20px 0 0; font-size: 12px; color: #949BA4;">If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Reset your TwitchMetrics password: ${resetUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to send password reset email via Resend.");
  }
}

export async function requestPasswordReset({
  email,
  request,
}: {
  email: string;
  request: Request;
}) {
  const normalizedEmail = normalizeResetEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, suspended: true },
  });

  if (!user?.email || user.suspended) {
    return;
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentRequests = await prisma.passwordResetToken.count({
    where: {
      userId: user.id,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentRequests >= MAX_RESET_REQUESTS_PER_HOUR) {
    return;
  }

  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  const resetUrl = new URL("/reset-password", getAppOrigin(request));
  resetUrl.searchParams.set("token", rawToken);

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestIpHash: hashRequestMetadata(getRequestIp(request)),
        userAgentHash: hashRequestMetadata(request.headers.get("user-agent")),
      },
    });
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl: resetUrl.toString(),
    });
  } catch (error) {
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    throw error;
  }
}

export async function resetPasswordWithToken({
  token,
  password,
}: {
  token: string;
  password: string;
}): Promise<boolean> {
  const tokenHash = hashResetToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true,
    },
  });

  if (
    !resetToken ||
    resetToken.consumedAt ||
    resetToken.expiresAt.getTime() <= Date.now()
  ) {
    return false;
  }

  const newPasswordHash = await hashPassword(password, 12);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (consumed.count !== 1) {
      return false;
    }

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: newPasswordHash },
    });

    await tx.passwordResetToken.updateMany({
      where: {
        userId: resetToken.userId,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    return true;
  });
}
