import Link from "next/link";
import {
  Broadcast,
  Briefcase,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";

const CREATOR_BULLETS = [
  {
    lead: "Get discovered.",
    body: "Your profile lives inside the Stream Hatchet network where brands already source talent.",
  },
  {
    lead: "Look professional instantly.",
    body: "Verified, auto-updating stats. One link covers every platform — Twitch, YouTube, TikTok, Instagram, X, Kick.",
  },
  {
    lead: "Own your story.",
    body: "Spotlight partnerships, rates, audience, and the games that define your channel.",
  },
];

const AGENCY_BULLETS = [
  {
    lead: "Close deals faster.",
    body: "Verified data brands don't question.",
  },
  {
    lead: "Your full roster, one dashboard.",
    body: "Every creator, every platform, always updated.",
  },
  {
    lead: "Pitch-ready exports in one click.",
    body: "PDF, CSV, branded. Zero design work.",
  },
];

type ColumnProps = {
  eyebrowIcon: React.ComponentType<{
    size?: number;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
    className?: string;
  }>;
  eyebrow: string;
  title: string;
  bullets: { lead: string; body: string }[];
  ctaLabel: string;
  ctaHref: string;
  variant: "primary" | "secondary";
};

function AudienceColumn({
  eyebrowIcon: Eyebrow,
  eyebrow,
  title,
  bullets,
  ctaLabel,
  ctaHref,
  variant,
}: ColumnProps) {
  const isPrimary = variant === "primary";
  return (
    <div
      className={
        "relative flex h-full flex-col overflow-hidden rounded-2xl border p-8 sm:p-10 " +
        (isPrimary
          ? "border-[#E32C19]/40 bg-gradient-to-b from-[#313338] to-[#2B2D31]"
          : "border-[#3F4147] bg-[#313338]")
      }
    >
      {isPrimary && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#E32C19]/15 blur-3xl"
        />
      )}

      <div className="relative">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#E32C19]">
          <Eyebrow size={14} weight="duotone" />
          {eyebrow}
        </div>
        <h3 className="mt-4 font-display text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
          {title}
        </h3>

        <ul className="mt-8 space-y-5">
          {bullets.map((b) => (
            <li key={b.lead} className="flex gap-3">
              <CheckCircle
                size={20}
                weight="fill"
                className="mt-0.5 flex-shrink-0 text-[#E32C19]"
              />
              <div>
                <p className="text-sm font-semibold text-[#F2F3F5]">{b.lead}</p>
                <p className="mt-1 text-sm leading-relaxed text-[#949BA4]">
                  {b.body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <Link
            href={ctaHref}
            className={
              "inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-colors sm:w-auto " +
              (isPrimary
                ? "bg-[#E32C19] text-white hover:bg-[#C72615] active:bg-[#B02010]"
                : "border border-[#3F4147] bg-[#1E1F22] text-[#F2F3F5] hover:bg-[#383A40]")
            }
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AudienceSplit() {
  return (
    <section className="bg-[#1E1F22] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#F2F3F5] sm:text-4xl">
            One platform.{" "}
            <span className="text-[#E32C19]">Two ways to win.</span>
          </h2>
          <p className="mt-4 text-base text-[#949BA4] sm:text-lg">
            Whether you&apos;re building your own kit or managing a full roster
            — TwitchMetrics meets you where you are.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <AudienceColumn
            eyebrowIcon={Broadcast}
            eyebrow="For Creators"
            title="Get brand-ready in minutes."
            bullets={CREATOR_BULLETS}
            ctaLabel="Create your free media kit"
            ctaHref="/register?role=creator"
            variant="primary"
          />
          <AudienceColumn
            eyebrowIcon={Briefcase}
            eyebrow="For Talent Agencies"
            title="Build your free roster dashboard."
            bullets={AGENCY_BULLETS}
            ctaLabel="Get the roster dashboard"
            ctaHref="/register?role=talent_manager"
            variant="secondary"
          />
        </div>
      </div>
    </section>
  );
}
