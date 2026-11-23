import Image from "next/image";
import { COUNTRY_FLAG_CODES } from "@/lib/constants/country-flags";

export function CountryFlag({ code }: { code: string }) {
  const normalized = code.trim().toLowerCase();
  return COUNTRY_FLAG_CODES.has(normalized) ? (
    <Image
      src={`/country-flags/${normalized}.svg`}
      alt=""
      width={24}
      height={18}
      className="h-[18px] w-6 shrink-0 rounded-sm object-cover"
      unoptimized
    />
  ) : (
    <svg
      aria-hidden
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="shrink-0 text-[var(--view-muted,#949BA4)]"
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6h14M5 18h14" />
    </svg>
  );
}
