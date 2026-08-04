import { createLogger } from "@/lib/logger";
import { SITE_URL } from "@/lib/constants/seo";
import { EMAIL_FROM, sendEmail } from "./email";

const log = createLogger("report-purchase-notifications");

/**
 * Replies to the confirmation go to the team inbox that handles report
 * customers — same override as the quote pipeline so all report mail routes
 * to one place per environment.
 */
const SUPPORT_INBOX =
  process.env.REPORTS_NOTIFICATION_EMAIL ?? "sales@streamhatchet.com";

export type ReportPurchaseConfirmationInput = {
  purchaseId: string;
  name: string;
  email: string;
  templateName: string;
  /** Amount actually charged, in cents (falls back to template price). */
  amountInCents: number;
};

/** Escape user-provided values before embedding in HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)} USD`;
}

function confirmationHtml(
  input: ReportPurchaseConfirmationInput,
  downloadUrl: string,
  orderDate: string,
) {
  const firstName = input.name.trim().split(/\s+/)[0] || "there";

  const orderRows = [
    { label: "Report", value: input.templateName },
    { label: "Amount", value: formatAmount(input.amountInCents) },
    { label: "Order date", value: orderDate },
    { label: "Order reference", value: input.purchaseId },
  ]
    .map(
      (f) => `
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #949BA4; font-size: 13px; vertical-align: top; white-space: nowrap;">${esc(f.label)}</td>
          <td style="padding: 8px 0; color: #F2F3F5; font-size: 13px; word-break: break-all;">${esc(f.value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; background: #2B2D31; color: #DBDEE1; padding: 32px 24px; max-width: 560px;">
      <p style="margin: 0 0 24px; font-size: 15px; font-weight: bold; color: #F2F3F5;">Twitch<span style="color: #E32C19;">Metrics</span></p>
      <h2 style="margin: 0 0 12px; color: #F2F3F5;">Order confirmed — your report is ready</h2>
      <p style="margin: 0 0 20px; color: #DBDEE1; font-size: 14px; line-height: 1.6;">
        Hi ${esc(firstName)}, thanks for your purchase. Your payment has been received, and your report is generated from the latest data each time you download it.
      </p>
      <div style="margin: 0 0 24px; padding: 16px; background: #1E1F22; border-radius: 8px; border: 1px solid #3F4147;">
        <table style="width: 100%; border-collapse: collapse;">${orderRows}</table>
      </div>
      <a href="${esc(downloadUrl)}" style="display: inline-block; background: #E32C19; color: #FFFFFF; font-size: 14px; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px;">Download report (CSV)</a>
      <p style="margin: 20px 0 0; color: #949BA4; font-size: 13px; line-height: 1.6;">
        If the button doesn't work, copy this link into your browser:<br />
        <a href="${esc(downloadUrl)}" style="color: #E32C19; word-break: break-all;">${esc(downloadUrl)}</a>
      </p>
      <p style="margin: 16px 0 0; color: #949BA4; font-size: 13px; line-height: 1.6;">
        The link doesn't expire — keep this email to re-download your file whenever you need it. Need help or an invoice? Just reply to this email and our team will take care of it.
      </p>
      <hr style="margin: 28px 0 16px; border: none; border-top: 1px solid #3F4147;" />
      <p style="margin: 0 0 8px; font-size: 11px; color: #6D7178; line-height: 1.6;">
        This is a transactional confirmation of a purchase you made on TwitchMetrics — it is not marketing, and you have not been added to any mailing list.
      </p>
      <p style="margin: 0; font-size: 11px; color: #6D7178;">
        © TwitchMetrics · Custom reports powered by Stream Hatchet ·
        <a href="${SITE_URL}/terms" style="color: #949BA4;">Terms</a> ·
        <a href="${SITE_URL}/privacy" style="color: #949BA4;">Privacy</a>
      </p>
    </div>`;
}

function confirmationText(
  input: ReportPurchaseConfirmationInput,
  downloadUrl: string,
  orderDate: string,
) {
  const firstName = input.name.trim().split(/\s+/)[0] || "there";
  return [
    "Order confirmed — your report is ready",
    "",
    `Hi ${firstName}, thanks for your purchase. Your payment has been received, and your report is generated from the latest data each time you download it.`,
    "",
    `Report: ${input.templateName}`,
    `Amount: ${formatAmount(input.amountInCents)}`,
    `Order date: ${orderDate}`,
    `Order reference: ${input.purchaseId}`,
    "",
    `Download your report (CSV): ${downloadUrl}`,
    "",
    "The link doesn't expire — keep this email to re-download your file whenever you need it. Need help or an invoice? Just reply to this email and our team will take care of it.",
    "",
    "This is a transactional confirmation of a purchase you made on TwitchMetrics — it is not marketing, and you have not been added to any mailing list.",
    `Terms: ${SITE_URL}/terms · Privacy: ${SITE_URL}/privacy`,
  ].join("\n");
}

/**
 * Emails the customer their purchase confirmation with a durable download
 * link. Same resilience contract as the lead/inquiry notifications: never
 * throws, failures are logged — a Resend hiccup must not break fulfillment.
 * Fire via `after()` from the single point where a purchase flips to paid.
 */
export async function sendReportPurchaseConfirmation(
  input: ReportPurchaseConfirmationInput,
): Promise<void> {
  // The success page verifies the purchase and offers the download, so the
  // emailed link reuses it rather than deep-linking the raw CSV endpoint.
  const downloadUrl = `${SITE_URL}/reports/success?purchase_id=${input.purchaseId}`;
  const orderDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  try {
    await sendEmail({
      to: input.email,
      from: EMAIL_FROM.hello,
      replyTo: SUPPORT_INBOX,
      subject: `Order confirmed — ${input.templateName}`,
      html: confirmationHtml(input, downloadUrl, orderDate),
      text: confirmationText(input, downloadUrl, orderDate),
    });
  } catch (err) {
    log.error(
      { err, purchaseId: input.purchaseId },
      "Report purchase confirmation email failed",
    );
  }
}
