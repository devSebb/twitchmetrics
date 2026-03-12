import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/server/db";
import { formatNumber } from "@/lib/utils/format";
import { CreatorFilters, CreatorGrid } from "@/components/creators";

export const metadata: Metadata = {
  title: "Top Creators | TwitchMetrics",
  description:
    "Browse the top creators across Twitch, YouTube, Instagram, TikTok, and more.",
};

async function getCreators() {
  const [creators, countResult] = await Promise.all([
    db.creatorProfile.findMany({
      orderBy: { totalFollowers: "desc" },
      take: 20,
      include: {
        platformAccounts: true,
        growthRollups: {
          orderBy: { computedAt: "desc" },
        },
      },
    }),
    db.creatorProfile.count(),
  ]);

  const data = creators.map((creator) => {
    const growthRollup =
      creator.growthRollups.find(
        (r) => r.platform === creator.primaryPlatform,
      ) ??
      creator.growthRollups[0] ??
      null;

    return {
      displayName: creator.displayName,
      slug: creator.slug,
      avatarUrl: creator.avatarUrl,
      totalFollowers: creator.totalFollowers.toString(),
      primaryPlatform: creator.primaryPlatform,
      platformAccounts: creator.platformAccounts.map((a) => ({
        platform: a.platform,
        platformUsername: a.platformUsername,
      })),
      growthRollup: growthRollup
        ? {
            delta7d: growthRollup.delta7d.toString(),
            pct7d: growthRollup.pct7d,
            trendDirection: growthRollup.trendDirection,
          }
        : null,
    };
  });

  return { data, total: countResult };
}

export default async function CreatorsPage() {
  const { data: initialCreators, total } = await getCreators();

  const initialMeta = {
    total,
    page: 1,
    limit: 20,
    totalPages: Math.ceil(total / 20),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[#F2F3F5]">Top Creators</h1>
        <span className="text-sm text-[#949BA4]">
          {formatNumber(total)} creators
        </span>
      </div>

      <Suspense>
        <div className="mb-6">
          <CreatorFilters />
        </div>
        <CreatorGrid initialData={initialCreators} initialMeta={initialMeta} />
      </Suspense>
    </div>
  );
}
