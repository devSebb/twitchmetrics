import { createLogger } from "@/lib/logger";
import { EMAIL_FROM, sendEmail } from "./email";

const log = createLogger("report-notifications");

/** Internal team inbox for custom-report requests. Override per environment. */
const SALES_INBOX =
  process.env.REPORTS_NOTIFICATION_EMAIL ?? "sales@streamhatchet.com";

// ─── Input shape (mirrors the `details` built by ReportRequestForm) ──────────

type LeadFormSnapshot = {
  include?: string | null;
  topCount?: number | string | null;
  timePeriod?: string | null;
  platforms?: string[];
  metrics?: string[];
  entityIds?: string[];
  entityLabels?: string[];
};

type LeadDetails = {
  formSnapshot?: LeadFormSnapshot | null;
  quoteReasons?: string[];
  customRange?: string | null;
};

export type ReportLeadNotificationInput = {
  name: string;
  email: string;
  company: string;
  details: LeadDetails | null;
};

// ─── Readable labels ─────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  hoursWatched: "Hours Watched",
  avgViewers: "Average Viewers",
  peakViewers: "Peak Viewers",
  topCreators: "Top Creators / Channels",
  airtime: "Airtime",
  subscribers: "Subscribers",
  gender: "Gender",
  country: "Country",
  topCategories: "Top Categories",
};

const PERIOD_LABELS: Record<string, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
  custom: "Custom range",
};

const PLATFORM_LABELS: Record<string, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
  kick: "Kick",
  otherStreaming: "Other live-streaming services",
};

function labelList(keys: string[] | undefined, map: Record<string, string>) {
  if (!keys || keys.length === 0) return "—";
  return keys.map((k) => map[k] ?? k).join(", ");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Escape user-provided values before embedding in HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Field extraction (readable, plain values) ───────────────────────────────

type Field = { label: string; value: string };

function buildFields(input: ReportLeadNotificationInput): Field[] {
  const snapshot = input.details?.formSnapshot ?? {};
  const quoteReasons = input.details?.quoteReasons ?? [];
  const customRange = input.details?.customRange ?? null;

  const reportType = snapshot.include ? titleCase(snapshot.include) : "—";

  // Scope: either a Top-N count or a hand-picked list of entities.
  let scope = "—";
  if (snapshot.entityLabels && snapshot.entityLabels.length > 0) {
    scope = snapshot.entityLabels.join(", ");
  } else if (
    snapshot.topCount !== null &&
    snapshot.topCount !== undefined &&
    snapshot.topCount !== ""
  ) {
    scope = `Top ${snapshot.topCount}`;
  }

  const periodKey = snapshot.timePeriod ?? "";
  let period = PERIOD_LABELS[periodKey] ?? periodKey ?? "—";
  if (periodKey === "custom" && customRange) {
    period = `Custom range — ${customRange}`;
  }

  return [
    { label: "Report type", value: reportType },
    { label: "Scope", value: scope },
    { label: "Time period", value: period || "—" },
    {
      label: "Platforms",
      value: labelList(snapshot.platforms, PLATFORM_LABELS),
    },
    { label: "Metrics", value: labelList(snapshot.metrics, METRIC_LABELS) },
    {
      label: "Why a quote",
      value: quoteReasons.length > 0 ? quoteReasons.join("; ") : "—",
    },
  ];
}

// ─── Email 1: internal notification → sales team ─────────────────────────────

function internalHtml(input: ReportLeadNotificationInput, fields: Field[]) {
  const rows = [
    { label: "Name", value: input.name },
    { label: "Email", value: input.email },
    { label: "Company", value: input.company },
    ...fields,
  ]
    .map(
      (f) => `
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #949BA4; font-size: 13px; vertical-align: top; white-space: nowrap;">${esc(f.label)}</td>
          <td style="padding: 8px 0; color: #F2F3F5; font-size: 13px;">${esc(f.value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; background: #2B2D31; color: #DBDEE1; padding: 24px; max-width: 640px;">
      <h2 style="margin: 0 0 4px; color: #F2F3F5;">New custom report request</h2>
      <p style="margin: 0 0 20px; color: #949BA4; font-size: 13px;">A visitor submitted a report combination that needs a manual quote. Reply to this email to respond directly to the customer.</p>
      <table style="width: 100%; border-collapse: collapse; border-top: 1px solid #3F4147;">${rows}</table>
      <p style="margin: 20px 0 0; font-size: 12px; color: #6D7178;">Sent by TwitchMetrics · reports pipeline</p>
    </div>`;
}

function internalText(input: ReportLeadNotificationInput, fields: Field[]) {
  const lines = [
    "New custom report request",
    "",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Company: ${input.company}`,
    ...fields.map((f) => `${f.label}: ${f.value}`),
    "",
    "Reply to this email to respond directly to the customer.",
  ];
  return lines.join("\n");
}

async function sendInternalNotification(input: ReportLeadNotificationInput) {
  const fields = buildFields(input);
  await sendEmail({
    to: SALES_INBOX,
    from: EMAIL_FROM.notifications,
    replyTo: input.email,
    subject: `New custom report request — ${input.company}`,
    html: internalHtml(input, fields),
    text: internalText(input, fields),
  });
}

// ─── Email 2: confirmation → customer ────────────────────────────────────────

async function sendCustomerConfirmation(input: ReportLeadNotificationInput) {
  const firstName = input.name.trim().split(/\s+/)[0] || "there";

  const html = `
    <div style="font-family: Arial, sans-serif; background: #2B2D31; color: #DBDEE1; padding: 24px; max-width: 560px;">
      <h2 style="margin: 0 0 12px; color: #F2F3F5;">Thanks, ${esc(firstName)} — we've got your request</h2>
      <p style="margin: 0 0 16px; color: #DBDEE1; font-size: 14px; line-height: 1.5;">
        Your custom report request has been received. Our team is reviewing the details and will get back to you shortly with next steps.
      </p>
      <p style="margin: 0 0 20px; color: #949BA4; font-size: 13px; line-height: 1.5;">
        No action is needed from you right now. If anything is urgent, just reply to this email.
      </p>
      <p style="margin: 0; font-size: 13px; color: #949BA4;">— The TwitchMetrics team</p>
    </div>`;

  const text = [
    `Thanks, ${firstName} — we've got your request.`,
    "",
    "Your custom report request has been received. Our team is reviewing the details and will get back to you shortly with next steps.",
    "",
    "No action is needed from you right now. If anything is urgent, just reply to this email.",
    "",
    "— The TwitchMetrics team",
  ].join("\n");

  await sendEmail({
    to: input.email,
    from: EMAIL_FROM.hello,
    subject: "We've received your report request",
    html,
    text,
  });
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Sends the internal alert and the customer confirmation. Resilient: each email
 * is independent, and the function never throws — failures are logged so a
 * Resend hiccup can't break the (already-saved) lead submission. Intended to be
 * called via `after()` so it runs off the request's critical path.
 */
export async function sendReportLeadNotifications(
  input: ReportLeadNotificationInput,
): Promise<void> {
  const outcomes = await Promise.allSettled([
    sendInternalNotification(input),
    sendCustomerConfirmation(input),
  ]);

  const which = ["internal-notification", "customer-confirmation"];
  outcomes.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
      log.error(
        { err: outcome.reason, email: which[i] },
        "Report lead notification failed",
      );
    }
  });
}
