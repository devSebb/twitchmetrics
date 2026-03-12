import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";

type FeaturedClipsProps = {
  clips: {
    id: string;
    title: string;
    thumbnailUrl: string;
    viewCount: number;
    createdAt: string;
    url: string;
  }[];
};

export function FeaturedClips({ clips }: FeaturedClipsProps) {
  if (clips.length === 0) {
    return (
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">
            Featured Clips
          </h2>
        </div>
        <Card className="flex items-center justify-center py-10">
          <p className="text-sm text-[#949BA4]">No clips available</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#F2F3F5]">Featured Clips</h2>
        <span className="text-xs text-[#949BA4]">Last 30 Days</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {clips.slice(0, 6).map((clip) => (
          <a
            key={clip.id}
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group overflow-hidden rounded-lg border border-[#3F4147] bg-[#313338] transition-colors hover:border-[#4E5058]"
          >
            {/* Thumbnail */}
            <div className="relative aspect-video overflow-hidden bg-[#383A40]">
              <Image
                src={clip.thumbnailUrl}
                alt={clip.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              />
              {/* View count badge */}
              <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {formatNumber(clip.viewCount)} views
              </div>
            </div>

            {/* Info */}
            <div className="p-2">
              <p className="line-clamp-2 text-xs font-medium text-[#DBDEE1]">
                {clip.title}
              </p>
              <p className="mt-0.5 text-[10px] text-[#949BA4]">
                {formatRelativeTime(clip.createdAt)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
