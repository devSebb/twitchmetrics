import { Article } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/widgets/EmptyState";

export function FeaturedPostsSection() {
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#F2F3F5]">
        <Article size={16} weight="duotone" className="text-[#949BA4]" />
        Featured Posts
      </h3>
      <EmptyState
        variant="no_data"
        title="Featured Posts"
        message="Coming soon."
        compact
      />
    </div>
  );
}
