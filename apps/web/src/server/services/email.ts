const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Verified sender addresses. `twitchmetrics.net` is verified in Resend, so any
 * address under it may be used as a `from`. These are purpose-bound — keep them
 * here as the single source of truth rather than scattering literals across
 * call sites. (Password reset + magic link still inline their own `noreply@`
 * for now; new code should import from here.)
 */
export const EMAIL_FROM = {
  /** System / transactional mail (password reset, magic link). */
  noreply: "TwitchMetrics <noreply@twitchmetrics.net>",
  /** Customer-facing, friendly mail (confirmations, digest). */
  hello: "TwitchMetrics <hello@twitchmetrics.net>",
  /** Internal notifications delivered to the team. */
  notifications: "TwitchMetrics Reports <notifications@twitchmetrics.net>",
} as const;

export type SendEmailParams = {
  to: string | string[];
  from: string;
  subject: string;
  html: string;
  text: string;
  /** Set so replies route to the customer instead of the sending address. */
  replyTo?: string;
};

/**
 * Minimal wrapper around the Resend REST API, matching the raw-fetch pattern
 * already used by the password-reset flow (keeps the Next app free of the
 * Resend SDK). Throws on missing key or non-2xx response — callers decide
 * whether to swallow the error (e.g. fire-and-forget notifications).
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY for email delivery.");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend email failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
}
