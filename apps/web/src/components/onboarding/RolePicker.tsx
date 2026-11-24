"use client";

export type OnboardingRole = "creator" | "talent_manager";

type RolePickerProps = {
  value: OnboardingRole | null;
  onSelect: (role: OnboardingRole) => void;
  disabled?: boolean;
};

export function RolePicker({
  value,
  onSelect,
  disabled = false,
}: RolePickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "creator"}
        onClick={() => onSelect("creator")}
        className={`rounded-lg border px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          value === "creator"
            ? "border-n-red bg-n-red/10"
            : "border-n-line bg-n-surface hover:bg-n-surface"
        }`}
      >
        <p className="text-base font-semibold text-n-ink">Creator</p>
        <p className="mt-1 text-xs text-n-slate">
          I create content on Twitch, YouTube, or other platforms. Track your
          growth, build your media kit, and connect with brands.
        </p>
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "talent_manager"}
        onClick={() => onSelect("talent_manager")}
        className={`rounded-lg border px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          value === "talent_manager"
            ? "border-n-red bg-n-red/10"
            : "border-n-line bg-n-surface hover:bg-n-surface"
        }`}
      >
        <p className="text-base font-semibold text-n-ink">Talent Manager</p>
        <p className="mt-1 text-xs text-n-slate">
          I manage creators and talent. Monitor your roster&apos;s performance
          and review the insights they share with you.
        </p>
      </button>
    </div>
  );
}
