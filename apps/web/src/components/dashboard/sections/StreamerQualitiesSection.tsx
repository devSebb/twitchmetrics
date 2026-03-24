import { Star } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/widgets/EmptyState";

export function StreamerQualitiesSection() {
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#F2F3F5]">
        <Star size={16} weight="duotone" className="text-[#949BA4]" />
        Streamer Qualities
      </h3>
      <EmptyState
        variant="no_data"
        title="Streamer Qualities"
        message="Coming soon."
        compact
      />
    </div>
  );
}
