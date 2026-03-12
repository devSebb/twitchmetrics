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
  unclaimed: "bg-[#383A40] text-[#949BA4]",
  pending_claim: "bg-yellow-900/30 text-[#f59e0b] border border-yellow-700/40",
  claimed: "bg-green-900/30 text-[#22c55e] border border-green-700/40",
  premium: "bg-amber-900/30 text-amber-400 border border-amber-700/40",
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
    const color = PLATFORM_CONFIG[platform].color;
    return (
      <span
        className={cn(base, "text-white", className)}
        style={{ backgroundColor: color }}
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
          "border border-[#3F4147] bg-transparent text-[#949BA4]",
          className,
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <span className={cn(base, "bg-[#383A40] text-[#DBDEE1]", className)}>
      {children}
    </span>
  );
}
