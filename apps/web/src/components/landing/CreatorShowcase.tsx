import { CreatorCard } from "@/components/shared/CreatorCard";
import type { Platform } from "@/lib/constants/platforms";

type ShowcaseCreator = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  primaryPlatform: Platform;
  platformAccounts: { platform: Platform; platformUsername: string }[];
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
};

type CreatorShowcaseProps = {
  creators: ShowcaseCreator[];
};

export function CreatorShowcase({ creators }: CreatorShowcaseProps) {
  if (creators.length === 0) return null;

  return (
    <section className="bg-[#2B2D31] py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#383A40]">
          {creators.map((creator) => (
            <div key={creator.slug} className="snap-start">
              <CreatorCard creator={creator} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
