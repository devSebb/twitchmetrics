import type { Metadata } from "next";
import {
  ChatCircleText,
  ClockCountdown,
  EnvelopeSimple,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Editorial";
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
  "Get in touch with the Noticed team — questions about creator analytics, custom reports, partnerships, or press. We reply within one business day.";

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
    body: "No ticket queues or bots. The people who build Noticed read and answer your message.",
  },
  {
    icon: UsersThree,
    title: "Creators & agencies",
    body: "Whether you manage one channel or a full roster, tell us what you're working on and we'll point you the right way.",
  },
] as const;

export default function ContactPage() {
  return (
    <Container className="n-form py-16 sm:py-24">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="mb-12">
        <p className="n-eyebrow inline-flex items-center gap-2 text-n-slate">
          <EnvelopeSimple size={14} weight="fill" className="text-n-red" />
          Contact
        </p>
        <h1 className="mt-6 text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[.98] tracking-[-.055em]">
          Let&apos;s <span className="text-n-red">talk.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-n-ink">
          Questions about creator analytics, custom reports, partnerships, or
          press — send us a message and the team will get back to you.
        </p>
      </div>

      {/* ── Expectations + form ──────────────────────────────────────────── */}
      <div className="grid gap-12 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {EXPECTATIONS.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="flex gap-4 border-t border-n-line py-6"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-n-red/10 text-n-red">
                <Icon size={22} weight="duotone" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-n-ink">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-n-slate">
                  {body}
                </p>
              </div>
            </article>
          ))}
        </div>

        <section className="border-t border-n-line pt-6 lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-n-red">
            Send a message
          </p>
          <h2 className="font-display mb-6 mt-2 text-xl font-bold text-n-ink">
            How can we help?
          </h2>
          <ContactForm />
        </section>
      </div>
    </Container>
  );
}
