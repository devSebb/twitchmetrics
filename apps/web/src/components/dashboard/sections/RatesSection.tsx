import { EmptyState } from "@/components/widgets/EmptyState";

export function RatesSection() {
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
      <h3 className="mb-3 text-sm font-semibold text-[#F2F3F5]">Rates</h3>
      <EmptyState
        variant="locked"
        title="Pro Feature"
        message="Upgrade to Pro to set and display your rates."
        actionLabel="Go Pro"
        actionHref="/reports"
        compact
      />
    </div>
  );
}
