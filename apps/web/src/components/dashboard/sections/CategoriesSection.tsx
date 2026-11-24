import { SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/widgets/EmptyState";

export function CategoriesSection() {
  return (
    <div className="rounded-xl border border-n-line bg-n-canvas p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-n-ink">
        <SquaresFour size={16} weight="duotone" className="text-n-slate" />
        Categories
      </h3>
      <EmptyState
        variant="no_data"
        title="Categories"
        message="Coming soon."
        compact
      />
    </div>
  );
}
