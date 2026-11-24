import Link from "next/link";
import { SearchBar } from "@/components/search";
import { Container, ActionLink } from "@/components/ui/Editorial";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils/format";
import { CreatorPortrait } from "./CreatorPortrait";
import { GrowthValue } from "./CreatorSummary";
import type { LandingCreator } from "./types";

export function HeroSection({
  creator,
}: {
  creator?: LandingCreator | undefined;
}) {
  const platforms = creator
    ? [...new Set(creator.platformAccounts.map((account) => account.platform))]
    : [];
  return (
    <section className="bg-n-ink text-white">
      <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-16 lg:py-24">
        <div>
          <p className="n-eyebrow text-[#C9CDD3]">
            For the creators worth noticing
          </p>
          <h1 className="mt-6 max-w-[720px] text-[clamp(3.25rem,6.4vw,5.25rem)] font-extrabold leading-[.98] tracking-[-.055em]">
            Your work.
            <br />
            Your audience.
            <br />
            Get noticed<span className="text-n-red">.</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-[#D2D5D7]">
            A media kit that keeps up with you. Bring your platforms, audience
            and performance together in one link. Free for creators. Powered by
            Hatchet.
          </p>
          <div className="mt-8 max-w-xl" id="find-your-kit">
            <SearchBar mode="hero" searchType="creators" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[#D2D5D7]">
            Your profile may already be here. Find it, claim it, make it yours.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <Link
              href="/register"
              className="font-semibold underline decoration-white/50 underline-offset-4 hover:decoration-white"
            >
              Create an account
            </Link>
            <Link
              href="#how-it-works"
              className="text-[#D2D5D7] underline decoration-white/50 underline-offset-4 hover:text-white"
            >
              How it works
            </Link>
          </div>
        </div>
        {creator ? (
          <div className="min-w-0 rounded-2xl bg-white p-6 text-n-ink shadow-[0_24px_64px_rgba(0,0,0,.2)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-n-line pb-5">
              <p className="n-eyebrow text-n-slate">A look inside</p>
              <span className="text-sm font-bold tracking-tight">
                noticed<span className="text-n-red">.</span>
              </span>
            </div>
            <div className="mt-7 flex items-center gap-5">
              <CreatorPortrait
                src={creator.avatarUrl}
                name={creator.displayName}
                priority
                className="h-20 w-20 sm:h-24 sm:w-24"
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest text-n-slate">
                  Creator profile
                </p>
                <h2 className="mt-2 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">
                  <Link
                    href={`/creator/${creator.slug}`}
                    className="hover:underline"
                  >
                    {creator.displayName}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-n-slate">
                  {PLATFORM_CONFIG[creator.primaryPlatform].name}
                </p>
              </div>
            </div>
            <div className="my-7 border-b border-n-line pb-7">
              <p className="n-eyebrow text-n-slate">Total audience</p>
              <p className="mt-2 text-[clamp(3.5rem,6vw,5rem)] font-extrabold leading-none tracking-[-.06em]">
                {formatNumber(Number(creator.totalFollowers))}
              </p>
              <p className="mt-3 text-sm text-n-slate">
                Followers across tracked accounts. Not a unique audience count.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="n-eyebrow text-n-slate">Follower change</p>
                <p className="mt-2 text-xl font-bold">
                  <GrowthValue creator={creator} />
                </p>
                <p className="mt-1 text-xs text-n-slate">
                  {PLATFORM_CONFIG[creator.primaryPlatform].name} · last 7 days
                </p>
              </div>
              <div>
                <p className="n-eyebrow text-n-slate">Platforms</p>
                <p className="mt-2 text-xl font-bold">{platforms.length}</p>
                <p className="mt-1 text-xs leading-relaxed text-n-slate">
                  {platforms.map((p) => PLATFORM_CONFIG[p].name).join(" · ")}
                </p>
              </div>
            </div>
            <ActionLink
              href={`/creator/${creator.slug}/media-kit`}
              variant="secondary"
              className="mt-7 w-full"
            >
              Explore this media kit
            </ActionLink>
            <p className="mt-3 text-center text-xs text-n-slate">
              Real creator data. Availability varies by platform.
            </p>
          </div>
        ) : (
          <div className="border-y border-white/25 py-12">
            <p className="n-eyebrow text-[#D2D5D7]">
              One link. The bigger picture.
            </p>
            <h2 className="mt-5 text-4xl font-bold tracking-tight">
              A home for everything you create.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[#D2D5D7]">
              Bring your public profile, connected platforms and creator-entered
              partnerships together.
            </p>
            <ActionLink href="/creators" variant="light" className="mt-8">
              Explore creators
            </ActionLink>
          </div>
        )}
      </Container>
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 border-t border-white/20 py-6">
          <p className="n-eyebrow text-[#C9CDD3]">
            A bigger picture, across platforms
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold sm:gap-x-8">
            {Object.values(PLATFORM_CONFIG).map((platform) => (
              <span key={platform.name}>{platform.name}</span>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
