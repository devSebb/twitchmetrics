"use client";

import Link from "next/link";
import { useAppearance } from "@/components/ui/Appearance";

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
  const appearance = useAppearance();
  const isLocked = variant === "locked";

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-6 px-4" : "py-10 px-6"
      } ${
        isLocked
          ? "rounded-lg border border-dashed border-[var(--view-line,#3F4147)] bg-[var(--view-canvas,#2B2D31)]"
          : "rounded-lg border border-dashed border-[var(--view-line,#3F4147)]"
      } ${className ?? ""}`}
    >
      <div
        className={`mb-3 text-[var(--view-muted,#949BA4)] ${isLocked ? "opacity-60" : ""}`}
      >
        {icon ?? (isLocked ? <LockIcon /> : <EmptyIcon />)}
      </div>

      <h4
        className={`text-sm font-semibold ${compact ? "text-xs" : "text-sm"} text-[var(--view-ink,#DBDEE1)]`}
      >
        {title}
      </h4>

      <p
        className={`mt-1 max-w-xs text-[var(--view-muted,#949BA4)] ${compact ? "text-xs" : "text-xs"}`}
      >
        {message}
      </p>

      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className={
            appearance === "noticed"
              ? "n-button n-button-secondary mt-4"
              : "mt-4 rounded-md bg-[#E32C19] px-4 py-2 text-sm font-semibold text-white"
          }
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
