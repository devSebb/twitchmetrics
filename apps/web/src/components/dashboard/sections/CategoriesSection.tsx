import { SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/widgets/EmptyState";

export function CategoriesSection() {
  return (
    <div className="rounded-xl border border-[var(--view-line,#3F4147)] bg-[var(--view-canvas,#313338)] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--view-ink,#F2F3F5)]">
        <SquaresFour
          size={16}
          weight="duotone"
          className="text-[var(--view-muted,#949BA4)]"
        />
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
