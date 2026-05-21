import { EmptyState } from "@/components/widgets/EmptyState";

export function FeaturedPostsSection() {
  return (
    <EmptyState
      variant="no_data"
      title="Featured Posts"
      message="Coming soon."
      compact
    />
  );
}
