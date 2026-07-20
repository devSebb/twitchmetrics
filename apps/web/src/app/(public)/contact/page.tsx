import type { Metadata } from "next";
import {
  ChatCircleText,
  ClockCountdown,
  EnvelopeSimple,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/Card";
import { ContactForm } from "@/components/contact/ContactForm";
import {
  SITE_URL,
  SITE_NAME,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
} from "@/lib/constants/seo";

const PAGE_PATH = "/contact";
const CANONICAL = `${SITE_URL}${PAGE_PATH}`;

const PAGE_DESCRIPTION =
  "Get in touch with the TwitchMetrics team — questions about creator analytics, custom reports, partnerships, or press. We reply within one business day.";

export const metadata: Metadata = {
  title: "Contact Us",
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: `Contact ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: SITE_NAME,
    images: [
      { url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME },
    ],
  },
  twitter: {
    card: "summary",
    site: TWITTER_HANDLE,
    title: `Contact ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
  alternates: { canonical: CANONICAL },
};

const EXPECTATIONS = [
  {
    icon: ClockCountdown,
    title: "One business day",
    body: "Every message lands directly with the team — expect a reply within one business day.",
  },
  {
    icon: ChatCircleText,
    title: "Real humans",
    body: "No ticket queues or bots. The people who build TwitchMetrics read and answer your message.",
  },
  {
    icon: UsersThree,
    title: "Creators & agencies",
    body: "Whether you manage one channel or a full roster, tell us what you're working on and we'll point you the right way.",
  },
] as const;

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="mb-12">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#3F4147] bg-[#313338]/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#DBDEE1]">
          <EnvelopeSimple size={14} weight="fill" className="text-[#E32C19]" />
          Contact
        </p>
        <h1 className="font-display mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-[#F2F3F5] sm:text-5xl">
          Let&apos;s <span className="text-[#E32C19]">talk.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#DBDEE1]">
          Questions about creator analytics, custom reports, partnerships, or
          press — send us a message and the team will get back to you.
        </p>
      </div>

      {/* ── Expectations + form ──────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {EXPECTATIONS.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="flex gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#E32C19]/10 text-[#E32C19]">
                <Icon size={22} weight="duotone" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#F2F3F5]">
                  {title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[#949BA4]">
                  {body}
                </p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6 lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
            Send a message
          </p>
          <h2 className="font-display mb-6 mt-2 text-xl font-bold text-[#F2F3F5]">
            How can we help?
          </h2>
          <ContactForm />
        </Card>
      </div>
    </div>
  );
}
