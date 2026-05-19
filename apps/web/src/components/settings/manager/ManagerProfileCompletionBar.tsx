"use client";

import {
  computeManagerCompletion,
  type ManagerCompletionInput,
} from "@/lib/manager-profile-completion";

function getStrengthLabel(pct: number): string {
  if (pct >= 90) return "Complete";
  if (pct >= 70) return "Advanced";
  if (pct >= 40) return "Intermediate";
  return "Beginner";
}

function getStrengthColor(pct: number): string {
  if (pct >= 90) return "text-green-400";
  if (pct >= 70) return "text-blue-400";
  if (pct >= 40) return "text-yellow-400";
  return "text-[#949BA4]";
}

export function ManagerProfileCompletionBar(props: ManagerCompletionInput) {
  const pct = computeManagerCompletion(props).percentage;
  const strengthLabel = getStrengthLabel(pct);
  const strengthColor = getStrengthColor(pct);

  const milestones = [25, 50, 75, 100];

  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#DBDEE1]">
          You have completed{" "}
          <span className="font-semibold text-[#F2F3F5]">{pct}%</span> of your
          manager profile
        </p>
        <span className={`text-xs font-medium ${strengthColor}`}>
          {strengthLabel}
        </span>
      </div>
      <div className="relative mt-3">
        <div className="h-2 w-full rounded-full bg-[#383A40]">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-[#E32C19] to-[#ff4d3a] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="absolute inset-0 flex items-center">
          {milestones.map((m) => (
            <div
              key={m}
              className="absolute -top-0.5 flex h-3 w-3 -translate-x-1/2 items-center justify-center"
              style={{ left: `${m}%` }}
            >
              {pct >= m ? (
                <div className="h-3 w-3 rounded-full border-2 border-[#313338] bg-[#E32C19]">
                  <svg
                    viewBox="0 0 12 12"
                    className="h-full w-full text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6l2 2 4-4" />
                  </svg>
                </div>
              ) : (
                <div className="h-3 w-3 rounded-full border-2 border-[#3F4147] bg-[#2B2D31]" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-1.5 h-4">
        {milestones.map((m) => (
          <span
            key={m}
            className="absolute -translate-x-1/2 text-[10px] text-[#949BA4]"
            style={{ left: `${m}%` }}
          >
            {m}%
          </span>
        ))}
      </div>
    </div>
  );
}
