import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  number,
  title,
  children,
  id,
}: {
  number: string;
  title: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5 border-b border-current pb-5">
      <div className="flex items-baseline gap-4 sm:gap-5">
        <span
          className="shrink-0 text-sm font-medium tabular-nums text-n-red"
          aria-hidden
        >
          {number}
        </span>
        <h2
          id={id}
          className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.04em]"
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export function ActionLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "light";
}) {
  return (
    <Link
      {...props}
      className={cn("n-button", `n-button-${variant}`, className)}
    />
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="border-y border-n-line py-10 text-base leading-relaxed text-n-slate">
      {children}
    </p>
  );
}
