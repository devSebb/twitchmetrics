import { createLogger } from "@/lib/logger";
import { EMAIL_FROM, sendEmail } from "./email";

const log = createLogger("contact-notifications");

/** Team inbox for contact-form messages. Override per environment. */
const CONTACT_INBOX =
  process.env.CONTACT_NOTIFICATION_EMAIL ?? "sales@streamhatchet.com";

export type ContactNotificationInput = {
  name: string;
  email: string;
  company: string | null;
  topic: string;
  message: string;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldRows(fields: { label: string; value: string }[]): string {
  return fields
    .map(
      (f) => `<tr>
        <td style="padding: 8px 16px 8px 0; color: #4A505B; font-size: 13px; vertical-align: top; white-space: nowrap;">${esc(f.label)}</td>
        <td style="padding: 8px 0; color: #151F2C; font-size: 13px;">${esc(f.value)}</td>
      </tr>`,
    )
    .join("");
}

/**
 * Delivers a contact-form submission to the team inbox. Reply-to is set to
 * the sender so the team can answer directly from their client. Never
 * throws — the lead is already persisted, so delivery failure is logged
 * and swallowed.
 */
export async function sendContactNotification(
  input: ContactNotificationInput,
): Promise<void> {
  const fields = [
    { label: "Name", value: input.name },
    { label: "Email", value: input.email },
    { label: "Company", value: input.company || "—" },
    { label: "Topic", value: input.topic },
  ];

  const html = `
    <div style="background: #EFEFEF; padding: 32px; font-family: 'Golos Text', Arial, sans-serif;">
      <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #D9D9D9; border-radius: 12px; padding: 32px;">
        <p style="margin: 0; color: #C4262C; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em;">Contact form</p>
        <h1 style="margin: 12px 0 20px; color: #151F2C; font-size: 20px;">New message from ${esc(input.name)}</h1>
        <table style="border-collapse: collapse;">${fieldRows(fields)}</table>
        <div style="margin-top: 20px; padding: 16px; background: #FFFFFF; border: 1px solid #D9D9D9; border-radius: 8px;">
          <p style="margin: 0; color: #151F2C; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${esc(input.message)}</p>
        </div>
        <p style="margin: 20px 0 0; color: #4A505B; font-size: 12px;">Reply to this email to answer ${esc(input.name)} directly.</p>
      </div>
    </div>`;

  const text = [
    `New contact-form message`,
    ...fields.map((f) => `${f.label}: ${f.value}`),
    "",
    input.message,
  ].join("\n");

  try {
    await sendEmail({
      to: CONTACT_INBOX,
      from: EMAIL_FROM.notifications,
      replyTo: input.email,
      subject: `Contact form — ${input.topic} — ${input.name}`,
      html,
      text,
    });
  } catch (error) {
    log.error({ error }, "Failed to deliver contact notification");
  }
}
