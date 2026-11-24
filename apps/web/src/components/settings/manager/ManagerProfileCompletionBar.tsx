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
  if (pct >= 90) return "text-n-success";
  if (pct >= 70) return "text-n-navy";
  if (pct >= 40) return "text-n-warning";
  return "text-n-slate";
}

export function ManagerProfileCompletionBar(props: ManagerCompletionInput) {
  const pct = computeManagerCompletion(props).percentage;
  const strengthLabel = getStrengthLabel(pct);
  const strengthColor = getStrengthColor(pct);

  const milestones = [25, 50, 75, 100];

  return (
    <div className="rounded-xl border border-n-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-n-ink">
          You have completed{" "}
          <span className="font-semibold text-n-ink">{pct}%</span> of your
          manager profile
        </p>
        <span className={`text-xs font-medium ${strengthColor}`}>
          {strengthLabel}
        </span>
      </div>
      <div className="relative mt-3">
        <div
          role="progressbar"
          aria-label="Profile completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 w-full rounded-full bg-n-surface"
        >
          <div
            className="h-2 rounded-full bg-n-red transition-all duration-500"
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
                <div className="h-3 w-3 rounded-full border-2 border-white bg-n-red">
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
                <div className="h-3 w-3 rounded-full border-2 border-n-line bg-n-surface" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-1.5 h-4">
        {milestones.map((m) => (
          <span
            key={m}
            className="absolute -translate-x-1/2 text-xs text-n-slate"
            style={{ left: `${m}%` }}
          >
            {m}%
          </span>
        ))}
      </div>
    </div>
  );
}
