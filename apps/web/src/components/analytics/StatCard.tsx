import type { ReactNode } from "react";
import { Card } from "@/components/ui";

type StatCardProps = {
  label: string;
  value: string;
  change?: number;
  icon?: ReactNode;
};

export function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-[#949BA4]">
          {label}
        </p>
        {icon ? <span className="text-[#949BA4]">{icon}</span> : null}
      </div>
      <p className="text-2xl font-bold text-[#F2F3F5]">{value}</p>
      {typeof change === "number" ? (
        <p
          className={
            change >= 0 ? "text-xs text-[#4ade80]" : "text-xs text-[#f87171]"
          }
        >
          {change >= 0 ? "+" : ""}
          {change.toFixed(1)}%
        </p>
      ) : null}
    </Card>
  );
}
