"use client";

import Link from "next/link";

type EmptyStateVariant = "no_data" | "locked";

type EmptyStateProps = {
  variant: EmptyStateVariant;
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
  compact?: boolean;
  className?: string;
};

const LockIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EmptyIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    <path d="M9 10h.01M15 10h.01M9.5 15.5a3.5 3.5 0 0 1 5 0" />
  </svg>
);

export function EmptyState({
  variant,
  title,
  message,
  actionLabel,
  actionHref,
  icon,
  compact = false,
  className,
}: EmptyStateProps) {
  const isLocked = variant === "locked";

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-6 px-4" : "py-10 px-6"
      } ${
        isLocked
          ? "rounded-lg border border-dashed border-n-line bg-n-canvas"
          : "rounded-lg border border-dashed border-n-line"
      } ${className ?? ""}`}
    >
      <div className={`mb-3 text-n-slate ${isLocked ? "opacity-60" : ""}`}>
        {icon ?? (isLocked ? <LockIcon /> : <EmptyIcon />)}
      </div>

      <h4
        className={`text-sm font-semibold ${compact ? "text-xs" : "text-sm"} text-n-ink`}
      >
        {title}
      </h4>

      <p
        className={`mt-1 max-w-xs text-n-slate ${compact ? "text-xs" : "text-xs"}`}
      >
        {message}
      </p>

      {actionLabel && actionHref ? (
        <Link href={actionHref} className={"n-button n-button-secondary mt-4"}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
