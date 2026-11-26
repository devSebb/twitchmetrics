import Image from "next/image";
import Link from "next/link";
import { Container, ActionLink } from "@/components/ui/Editorial";
import { CreatorPortrait } from "@/components/landing/CreatorPortrait";
import { PlatformIcon, SyncStatus, InfoTip } from "@/components/shared";
import { getSafeImageSrc } from "@/lib/safeImage";
import { CREATOR_HEADER_INFO } from "@/lib/constants/metric-info";
import {
  buildCreatorHero,
  type CreatorHeroCell,
  type CreatorHeroData,
  type CreatorHeroNameSize,
} from "@/lib/creator-hero";
import { CreatorBioPanel } from "./CreatorBioPanel";
import type { ReactNode } from "react";

// Longer names step down so a channel title never crowds out the numbers.
const NAME_SIZE: Record<CreatorHeroNameSize, string> = {
  xl: "text-[clamp(3.25rem,9vw,7.5rem)]",
  lg: "text-[clamp(2.5rem,6.5vw,5.5rem)]",
  md: "text-[clamp(2rem,4.6vw,3.875rem)]",
  sm: "text-[clamp(1.75rem,3.6vw,3rem)]",
};

function PlatformCell({ cell }: { cell: CreatorHeroCell }) {
  const contents = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-white/85">
        <PlatformIcon platform={cell.platform} />
        {cell.name}
      </span>
      <span
        className={`mt-3 block text-[2rem] leading-none tracking-[-.04em] ${cell.missing ? "font-normal text-white/60" : "font-extrabold"}`}
        title={cell.missing ? undefined : cell.unit}
      >
        {cell.display}
      </span>
      {cell.handle && (
        <span className="mt-1.5 block truncate text-xs text-white/70">
          {cell.handle}
        </span>
      )}
      {cell.missing ? (
        <span className="mt-3 block text-xs text-white/70">
          Count not public
        </span>
      ) : (
        cell.share && (
          <span className="mt-3 flex items-center gap-2">
            <span aria-hidden className="block h-[3px] flex-1 bg-white/15">
              <span
                className="block h-full"
                style={{
                  width: `${cell.barPct ?? 0}%`,
                  backgroundColor: cell.color,
                }}
              />
            </span>
            <span className="text-xs text-white/70">{cell.share}</span>
          </span>
        )
      )}
    </>
  );
  const className = "block h-full min-w-0 py-5 pr-5 lg:px-6 lg:pb-1 lg:pt-7";
  return (
    <li className="min-w-0 border-b border-white/15 lg:max-w-[200px] lg:flex-1 lg:border-b-0 lg:border-l">
      {cell.href ? (
        <a
          href={cell.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${className} hover:bg-white/5`}
        >
          {contents}
        </a>
      ) : (
        <div className={className} title="External profile unavailable">
          {contents}
        </div>
      )}
    </li>
  );
}

export function EditorialCreatorHeader({
  creator,
  kit = false,
  owner = false,
  actions,
}: {
  creator: CreatorHeroData;
  kit?: boolean;
  owner?: boolean;
  actions?: ReactNode;
}) {
  const hero = buildCreatorHero(creator, { owner });
  const banner = getSafeImageSrc(creator.bannerUrl);
  const managed = creator.state === "claimed" || creator.state === "premium";
  const only = hero.mode === "single" ? hero.cells[0] : undefined;
  const stripGap = owner ? "mt-8" : "mt-10 lg:mt-14";
  return (
    <header className="n-dark relative overflow-hidden bg-n-ink text-white">
      {banner && (
        <div className="absolute inset-0 opacity-20">
          <Image
            src={banner}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-n-ink to-transparent" />
        </div>
      )}
      <Container
        className={
          owner ? "relative py-8 sm:py-10" : "relative py-12 sm:py-14 lg:py-16"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="n-eyebrow text-white/70">
            {kit ? "Creator media kit" : "Creator profile & analytics"}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {owner ? null : managed ? (
              <span className="text-sm text-white/80">
                {creator.state === "premium"
                  ? "Premium profile"
                  : "Managed by the creator"}
              </span>
            ) : creator.state === "pending_claim" ? (
              <span className="text-sm text-white/80">Claim pending</span>
            ) : (
              <ActionLink href={`/claim?profile=${creator.id}`}>
                Claim this profile
              </ActionLink>
            )}
            {actions}
          </div>
        </div>

        <div
          className={`${stripGap} flex flex-col gap-7 lg:flex-row lg:items-end lg:gap-16`}
        >
          <div className="flex min-w-0 items-center gap-4 sm:gap-6 lg:flex-[3]">
            <CreatorPortrait
              src={creator.avatarUrl}
              name={creator.displayName}
              priority
              className="h-16 w-16 ring-2 ring-n-red ring-offset-[3px] ring-offset-n-ink sm:h-[88px] sm:w-[88px] lg:h-[104px] lg:w-[104px]"
            />
            <div className="min-w-0">
              <h1
                className={`break-words font-extrabold leading-[.95] tracking-[-.05em] ${NAME_SIZE[hero.nameSize]}`}
              >
                {creator.displayName}
                <span className="text-n-red">.</span>
              </h1>
              {(hero.meta.length > 0 || hero.lastStreamed) && (
                <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm font-semibold text-white/80 sm:mt-4">
                  {hero.meta.map((part, index) => (
                    <span key={part}>
                      {index > 0 && (
                        <span aria-hidden className="mr-2 text-white/40">
                          ·
                        </span>
                      )}
                      {part}
                    </span>
                  ))}
                  {hero.lastStreamed && (
                    <span suppressHydrationWarning>
                      {hero.meta.length > 0 && (
                        <span aria-hidden className="mr-2 text-white/40">
                          ·
                        </span>
                      )}
                      {hero.lastStreamed}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          {hero.bioPreview && (
            <div className="min-w-0 lg:max-w-[30rem] lg:flex-[2]">
              <p className="line-clamp-3 break-words text-base leading-relaxed text-white/85">
                {hero.bioPreview}
              </p>
              {hero.hasFullBio && creator.bio && (
                <CreatorBioPanel
                  name={creator.displayName}
                  bio={creator.bio.trim()}
                />
              )}
            </div>
          )}
        </div>

        {hero.mode === "multi" && (
          <div className={`${stripGap} border-t border-white/25 lg:flex`}>
            <div className="py-6 lg:shrink-0 lg:pb-1 lg:pr-12 lg:pt-7">
              <p className="n-eyebrow flex items-center gap-2 text-white/70">
                {hero.totalLabel}{" "}
                <InfoTip inverted info={CREATOR_HEADER_INFO.totalFollowers} />
              </p>
              <p className="mt-2 text-[clamp(3rem,5.5vw,4.5rem)] font-extrabold leading-none tracking-[-.055em]">
                {hero.total}
              </p>
            </div>
            <ul className="grid grid-cols-2 border-t border-white/15 sm:grid-cols-3 lg:flex lg:min-w-0 lg:flex-1 lg:border-t-0">
              {hero.cells.map((cell) => (
                <PlatformCell key={cell.platform} cell={cell} />
              ))}
            </ul>
          </div>
        )}

        {only && (
          <div className={`${stripGap} border-t border-white/25 pt-6 lg:pt-7`}>
            <p className="n-eyebrow flex items-center gap-2 text-white/70">
              <PlatformIcon platform={only.platform} />
              {hero.totalLabel}
            </p>
            <p
              className={`mt-2 text-[clamp(3rem,5.5vw,4.5rem)] leading-none tracking-[-.055em] ${only.missing ? "font-normal text-white/60" : "font-extrabold"}`}
            >
              {hero.total}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-white/80">
              {only.missing && <span>Count not public</span>}
              {only.href ? (
                <a
                  href={only.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] max-w-full items-center font-semibold underline underline-offset-4"
                >
                  <span className="truncate">
                    {only.handle || `Open on ${only.name}`}
                  </span>
                </a>
              ) : (
                only.handle && (
                  <span
                    className="truncate py-3"
                    title="External profile unavailable"
                  >
                    {only.handle}
                  </span>
                )
              )}
            </p>
          </div>
        )}

        <div
          className={`${hero.mode === "none" ? stripGap : "mt-7"} flex flex-wrap items-center justify-between gap-x-6 gap-y-2`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SyncStatus inverted lastSyncedAt={creator.lastSnapshotAt} />
            {hero.mode === "multi" && (
              <span className="text-xs text-white/70">
                Followers across tracked accounts. Not a unique audience count.
              </span>
            )}
          </div>
          <Link
            href={
              kit
                ? `/creator/${creator.slug}`
                : `/creator/${creator.slug}/media-kit`
            }
            className="inline-flex min-h-[44px] items-center text-sm font-semibold underline underline-offset-4"
          >
            {kit
              ? "Explore the full analytics profile"
              : "Open the shareable media kit"}{" "}
            ↗
          </Link>
        </div>
      </Container>
    </header>
  );
}
