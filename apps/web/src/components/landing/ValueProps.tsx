import Link from "next/link";
import {
  PlugsConnected,
  Broadcast,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/Card";

const VALUE_PROPS = [
  {
    icon: PlugsConnected,
    lead: "Built automatically.",
    body: "Connect the accounts. We build the kit. No manual updates.",
  },
  {
    icon: Broadcast,
    lead: "Show the full reach.",
    body: "Every platform — Twitch, YouTube, TikTok, Instagram, X, Kick — one dashboard.",
  },
  {
    icon: ShieldCheck,
    lead: "100% verified data.",
    body: "Every profile is backed by Stream Hatchet — the same data trusted by gaming publishers and global brands.",
  },
] as const;

export function ValueProps() {
  return (
    <section className="bg-[#1E1F22] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#F2F3F5] sm:text-4xl">
            Stop sending screenshots.
            <br />
            <span className="text-[#E32C19]">Start closing deals.</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {VALUE_PROPS.map(({ icon: Icon, lead, body }) => (
            <Card key={lead} className="flex flex-col gap-4 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E32C19]/10 text-[#E32C19]">
                <Icon size={22} weight="duotone" />
              </div>
              <div>
                <p className="text-base font-semibold text-[#F2F3F5]">{lead}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#949BA4]">
                  {body}
                </p>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
          <Link
            href="/register?role=creator"
            className="inline-flex items-center text-sm font-semibold text-[#F2F3F5] underline-offset-4 transition-colors hover:text-[#E32C19] hover:underline"
          >
            For Creators →
          </Link>
          <span aria-hidden className="hidden text-[#3F4147] sm:inline">
            ·
          </span>
          <Link
            href="/register?role=talent_manager"
            className="inline-flex items-center text-sm font-semibold text-[#F2F3F5] underline-offset-4 transition-colors hover:text-[#E32C19] hover:underline"
          >
            For Talent Agencies →
          </Link>
        </div>
      </div>
    </section>
  );
}
