import { WIDGET_REGISTRY, type WidgetId } from "@/lib/constants/widgets";

type WidgetCardProps = {
  widgetId: WidgetId;
  children: React.ReactNode;
  className?: string | undefined;
};

/**
 * Chrome for a dashboard widget. Combined with `<EmptyWidgetSentinel />`,
 * the card auto-hides when a widget has no data — the `has-[...]:hidden`
 * Tailwind arbitrary variant targets the sentinel anywhere in the subtree.
 *
 * A widget that wants to soft-hide (rather than show a "No data" placeholder)
 * should render `<EmptyWidgetSentinel />` from its top-level return when empty.
 */
export function WidgetCard({ widgetId, children, className }: WidgetCardProps) {
  const def = WIDGET_REGISTRY[widgetId];
  return (
    <div
      data-widget-id={widgetId}
      className={`flex flex-col rounded-xl border border-[#3F4147] bg-[#313338] p-5 has-[[data-widget-empty]]:hidden ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#F2F3F5]">
          <def.icon size={16} weight="duotone" className="text-[#949BA4]" />
          {def.label}
        </h3>
      </div>
      {children}
    </div>
  );
}

/**
 * Sentinel rendered by a widget when it has no data to show. Invisible
 * in isolation; its presence triggers the parent `WidgetCard` to hide
 * itself entirely via CSS `:has()`.
 */
export function EmptyWidgetSentinel() {
  return <div data-widget-empty="true" hidden aria-hidden />;
}
