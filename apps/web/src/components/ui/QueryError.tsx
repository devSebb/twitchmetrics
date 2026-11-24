"use client";

export function QueryError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-l-2 border-n-error bg-n-error/5 p-5 text-sm text-n-ink"
    >
      <p>
        We couldn’t load {label}.{" "}
        <button
          type="button"
          className="font-semibold underline underline-offset-4"
          onClick={onRetry}
        >
          Try again
        </button>
      </p>
    </div>
  );
}
