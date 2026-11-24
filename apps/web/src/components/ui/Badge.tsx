import { cn } from "@/lib/utils";
import { PLATFORM_CONFIG, type Platform } from "@/lib/constants/platforms";

type BadgeVariant = "default" | "platform" | "status" | "outline";
type StatusType = "unclaimed" | "pending_claim" | "claimed" | "premium";

type BadgeProps = {
  variant?: BadgeVariant;
  platform?: Platform;
  status?: StatusType;
  className?: string;
  children: React.ReactNode;
};

const STATUS_STYLES: Record<StatusType, string> = {
  unclaimed: "bg-n-surface text-n-slate",
  pending_claim: "bg-n-warning/10 text-n-warning border border-n-warning/30",
  claimed: "bg-n-success/10 text-n-success border border-n-success/30",
  premium: "bg-n-warning/10 text-n-warning border border-n-warning/30",
};

export function Badge({
  variant = "default",
  platform,
  status,
  className,
  children,
}: BadgeProps) {
  const base =
    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap";

  if (variant === "platform" && platform) {
    const config = PLATFORM_CONFIG[platform];
    return (
      <span
        className={cn(base, className)}
        style={{
          backgroundColor: config.color,
          color: config.foregroundColor,
        }}
      >
        {children}
      </span>
    );
  }

  if (variant === "status" && status) {
    return (
      <span className={cn(base, STATUS_STYLES[status], className)}>
        {children}
      </span>
    );
  }

  if (variant === "outline") {
    return (
      <span
        className={cn(
          base,
          "border border-n-line bg-transparent text-n-slate",
          className,
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <span className={cn(base, "bg-n-surface text-n-ink", className)}>
      {children}
    </span>
  );
}
