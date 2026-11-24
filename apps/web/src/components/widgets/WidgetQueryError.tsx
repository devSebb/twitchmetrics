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
      className="rounded-lg border border-n-line px-5 py-8 text-center"
    >
      <p className="text-sm text-n-ink">
        We couldn’t load {label}. Your selection has been kept.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-n-line px-4 py-2 text-sm font-semibold text-n-ink hover:bg-n-surface"
      >
        Try again
      </button>
    </div>
  );
}
