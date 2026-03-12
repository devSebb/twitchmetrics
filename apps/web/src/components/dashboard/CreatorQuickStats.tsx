import { Card } from "@/components/ui";

type CreatorQuickStatsProps = {
  totalFollowers: string;
  growth7d: string;
  connectedPlatforms: number;
  lastEnrichmentAt: string | null;
};

export function CreatorQuickStats({
  totalFollowers,
  growth7d,
  connectedPlatforms,
  lastEnrichmentAt,
}: CreatorQuickStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <p className="text-xs uppercase text-[#949BA4]">Total followers</p>
        <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
          {totalFollowers}
        </p>
      </Card>
      <Card>
        <p className="text-xs uppercase text-[#949BA4]">7d growth</p>
        <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">{growth7d}</p>
      </Card>
      <Card>
        <p className="text-xs uppercase text-[#949BA4]">Connected platforms</p>
        <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
          {connectedPlatforms}
        </p>
      </Card>
      <Card>
        <p className="text-xs uppercase text-[#949BA4]">Last enrichment</p>
        <p className="mt-1 text-sm text-[#F2F3F5]">
          {lastEnrichmentAt
            ? new Date(lastEnrichmentAt).toLocaleString()
            : "Not available yet"}
        </p>
      </Card>
    </div>
  );
}
