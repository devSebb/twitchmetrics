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
        onClick={() => onSelect("creator")}
        className={`rounded-lg border px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          value === "creator"
            ? "border-[#E32C19] bg-[#E32C19]/10"
            : "border-[#3F4147] bg-[#383A40] hover:bg-[#4E5058]"
        }`}
      >
        <p className="text-base font-semibold text-[#F2F3F5]">Creator</p>
        <p className="mt-1 text-xs text-[#949BA4]">
          I create content on Twitch, YouTube, or other platforms. Track your
          growth, build your media kit, and connect with brands.
        </p>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect("talent_manager")}
        className={`rounded-lg border px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          value === "talent_manager"
            ? "border-[#E32C19] bg-[#E32C19]/10"
            : "border-[#3F4147] bg-[#383A40] hover:bg-[#4E5058]"
        }`}
      >
        <p className="text-base font-semibold text-[#F2F3F5]">Talent Manager</p>
        <p className="mt-1 text-xs text-[#949BA4]">
          I manage creators and talent. Monitor your roster&apos;s performance
          and coordinate campaigns.
        </p>
      </button>
    </div>
  );
}
