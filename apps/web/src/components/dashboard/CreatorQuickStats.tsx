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
      <div className="border-t border-n-line py-5">
        <p className="text-xs uppercase text-n-slate">Total followers</p>
        <p className="mt-1 text-3xl font-bold text-n-ink">{totalFollowers}</p>
      </div>
      <div className="border-t border-n-line py-5">
        <p className="text-xs uppercase text-n-slate">7d growth</p>
        <p className="mt-1 text-3xl font-bold text-n-ink">{growth7d}</p>
      </div>
      <div className="border-t border-n-line py-5">
        <p className="text-xs uppercase text-n-slate">Connected platforms</p>
        <p className="mt-1 text-3xl font-bold text-n-ink">
          {connectedPlatforms}
        </p>
      </div>
      <div className="border-t border-n-line py-5">
        <p className="text-xs uppercase text-n-slate">Last enrichment</p>
        <p className="mt-1 text-sm text-n-ink">
          {lastEnrichmentAt
            ? new Date(lastEnrichmentAt).toLocaleString()
            : "Not available yet"}
        </p>
      </div>
    </div>
  );
}
