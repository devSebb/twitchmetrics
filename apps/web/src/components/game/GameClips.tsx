import Image from "next/image";
import { formatNumber } from "@/lib/utils/format";

type GameClip = {
  id: string;
  clipId: string;
  title: string;
  thumbnailUrl: string;
  url: string;
  viewCount: number;
};

type GameClipsProps = {
  clips: GameClip[];
};

export function GameClips({ clips }: GameClipsProps) {
  if (clips.length === 0) return null;

  return (
    <div className="min-w-0">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight text-n-ink">
          Most Watched Clips
        </h3>
        <span className="text-xs text-n-slate">Last 30 Days</span>
      </div>

      <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {clips.slice(0, 8).map((clip) => (
          <a
            key={clip.id}
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group min-w-0 border-b border-n-line pb-4"
          >
            <div className="relative aspect-video bg-n-surface">
              <Image
                src={clip.thumbnailUrl}
                alt={clip.title}
                fill
                sizes="(min-width: 1280px) 282px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform group-hover:scale-105"
                loading="lazy"
                unoptimized
              />
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                {formatNumber(clip.viewCount)} views
              </span>
            </div>
            <div className="pt-3">
              <p className="line-clamp-2 text-sm font-semibold text-n-ink">
                {clip.title}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
