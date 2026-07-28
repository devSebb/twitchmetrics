import { createLogger } from "@/lib/logger";

const log = createLogger("newsletter");

const RESEND_CONTACTS_ENDPOINT = "https://api.resend.com/contacts";

/**
 * Adds a subscriber to the Resend audience. Uses the raw REST API (see
 * email.ts for the rationale on avoiding the Resend SDK). Contacts are
 * unique by email, so repeat signups are harmless.
 *
 * When RESEND_NEWSLETTER_SEGMENT_ID is set, the contact is also attached to
 * that segment so newsletter broadcasts can target signups specifically.
 *
 * Never throws — the signup is already persisted as a lead, so a Resend
 * failure is logged and swallowed.
 */
export async function addNewsletterContact(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_NEWSLETTER_SEGMENT_ID;

  if (!apiKey) {
    log.warn({}, "RESEND_API_KEY not configured; skipping Resend contact");
    return;
  }

  try {
    const response = await fetch(RESEND_CONTACTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
        ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      log.error(
        { status: response.status, body: body.slice(0, 200) },
        "Failed to add newsletter contact",
      );
    }
  } catch (error) {
    log.error({ error }, "Failed to add newsletter contact");
  }
}
