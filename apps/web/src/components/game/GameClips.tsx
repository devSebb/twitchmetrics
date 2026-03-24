import Image from "next/image";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
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
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#F2F3F5]">
          <MagnifyingGlass
            size={16}
            weight="duotone"
            className="text-[#949BA4]"
          />
          Most Watched Clips
        </h2>
        <span className="text-xs text-[#949BA4]">Last 30 Days</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {clips.slice(0, 8).map((clip) => (
          <a
            key={clip.id}
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group overflow-hidden rounded-lg border border-[#3F4147] transition-colors hover:border-[#4E5058]"
          >
            <div className="relative aspect-video bg-[#2B2D31]">
              <Image
                src={clip.thumbnailUrl}
                alt={clip.title}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover transition-transform group-hover:scale-105"
                loading="lazy"
                unoptimized
              />
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {formatNumber(clip.viewCount)} views
              </span>
            </div>
            <div className="p-2">
              <p className="line-clamp-2 text-xs font-medium text-[#DBDEE1]">
                {clip.title}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
