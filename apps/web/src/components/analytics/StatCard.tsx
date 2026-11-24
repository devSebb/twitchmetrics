import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  change?: number;
  icon?: ReactNode;
};

export function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <div className="min-w-0 space-y-2 border-t border-n-line py-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-n-slate">{label}</p>
        {icon ? <span className="text-n-slate">{icon}</span> : null}
      </div>
      <p className="text-2xl font-bold text-n-ink">{value}</p>
      {typeof change === "number" ? (
        <p
          className={
            change >= 0 ? "text-xs text-n-success" : "text-xs text-n-error"
          }
        >
          {change >= 0 ? "+" : ""}
          {change.toFixed(1)}%
        </p>
      ) : null}
    </div>
  );
}
