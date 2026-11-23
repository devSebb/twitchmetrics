"use client";

export function WidgetQueryError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--view-line,#3F4147)] px-5 py-8 text-center"
    >
      <p className="text-sm text-[var(--view-ink,#DBDEE1)]">
        We couldn’t load {label}. Your selection has been kept.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-[var(--view-line,#3F4147)] px-4 py-2 text-sm font-semibold text-[var(--view-ink,#DBDEE1)] hover:bg-[var(--view-surface,#383A40)]"
      >
        Try again
      </button>
    </div>
  );
}
