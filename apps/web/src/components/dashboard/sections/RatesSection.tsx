import { EmptyState } from "@/components/widgets/EmptyState";

export function RatesSection() {
  return (
    <EmptyState
      variant="locked"
      title="Pro Feature"
      message="Upgrade to Pro to set and display your rates."
      actionLabel="Go Pro"
      actionHref="/reports"
      compact
    />
  );
}
