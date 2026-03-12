import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { formatNumber } from "@/lib/utils/format";
import { PLATFORM_CONFIG, type Platform } from "@/lib/constants/platforms";
import { getSafeImageSrc } from "@/lib/safeImage";

type TopStreamersProps = {
  creators: {
    displayName: string;
    slug: string;
    avatarUrl: string | null;
    totalFollowers: string;
    primaryPlatform: Platform;
  }[];
};

export function TopStreamers({ creators }: TopStreamersProps) {
  if (creators.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">Top Streamers</h2>
        <Card className="flex items-center justify-center py-10">
          <p className="text-sm text-[#949BA4]">No streamer data available</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">Top Streamers</h2>
      <Card className="p-0">
        <div className="divide-y divide-[#3F4147]">
          {creators.map((creator, index) => {
            const platformColor =
              PLATFORM_CONFIG[creator.primaryPlatform].color;
            const safeAvatarUrl = getSafeImageSrc(creator.avatarUrl);
            return (
              <Link
                key={creator.slug}
                href={`/creator/${creator.slug}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[#383A40]"
              >
                {/* Rank */}
                <span className="w-6 text-center text-sm font-bold text-[#949BA4]">
                  {index + 1}
                </span>

                {/* Avatar */}
                <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
                  {safeAvatarUrl ? (
                    <Image
                      src={safeAvatarUrl}
                      alt={creator.displayName}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
                      style={{ backgroundColor: platformColor }}
                    >
                      {creator.displayName.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name + platform */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[#DBDEE1]">
                    {creator.displayName}
                  </div>
                </div>

                {/* Platform dot */}
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: platformColor }}
                  title={PLATFORM_CONFIG[creator.primaryPlatform].name}
                />

                {/* Followers */}
                <span className="text-sm font-medium text-[#949BA4]">
                  {formatNumber(Number(creator.totalFollowers))}
                </span>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
