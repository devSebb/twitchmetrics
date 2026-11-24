import Link from "next/link";
import { Container } from "@/components/ui/Editorial";
import { formatNumber } from "@/lib/utils/format";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { CreatorPortrait } from "./CreatorPortrait";
import { GrowthValue, LandingPlatforms } from "./CreatorSummary";
import type { LandingCreator } from "./types";
export function CreatorShowcase({ creators }: { creators: LandingCreator[] }) {
  if (!creators.length) return null;
  return (
    <section
      aria-labelledby="showcase-title"
      className="border-b border-n-line py-9"
    >
      <Container>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 id="showcase-title" className="n-eyebrow text-n-slate">
            Creators on the rise · last 7 days
          </h2>
          <Link
            href="/creators?sort=trending"
            className="text-sm font-semibold underline underline-offset-4"
          >
            Explore trending creators
          </Link>
        </div>
        <div
          className="flex snap-x gap-5 overflow-x-auto pb-4"
          tabIndex={0}
          role="region"
          aria-label="Creators on the rise, scroll to explore"
        >
          {creators.map((creator) => (
            <Link
              key={creator.slug}
              href={`/creator/${creator.slug}`}
              className="group w-[210px] shrink-0 snap-start border-r border-n-line pr-5 last:border-r-0"
            >
              <CreatorPortrait
                src={creator.avatarUrl}
                name={creator.displayName}
                className="h-14 w-14"
              />
              <h3 className="mt-4 truncate text-base font-bold group-hover:underline">
                {creator.displayName}
              </h3>
              <p className="mt-1 text-sm text-n-slate">
                {formatNumber(Number(creator.totalFollowers))} total followers
              </p>
              <p className="mt-3 text-base font-semibold">
                <GrowthValue creator={creator} />
                <span className="ml-2 text-xs font-normal text-n-slate">
                  in 7 days
                </span>
              </p>
              <p className="mt-1 text-xs text-n-slate">
                {PLATFORM_CONFIG[creator.primaryPlatform].name} follower change
              </p>
              <LandingPlatforms creator={creator} />
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
