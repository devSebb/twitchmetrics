"use client";

import Image from "next/image";
import { useState } from "react";
import { getSafeImageSrc } from "@/lib/safeImage";
import { cn } from "@/lib/utils";

/**
 * The lead image of a ranking row: a 40px circle for a creator, a 30x40
 * cover for a category. Same box whether or not the image loads, so a
 * missing or broken avatar never shifts the row.
 *
 * Unoptimised on purpose: a ranking shows 50 small images, the platform CDNs
 * already serve them small, and the image optimiser is metered.
 */
export function RankingAvatar({
  src,
  name,
  shape = "circle",
  size = "md",
}: {
  src: string | null;
  name: string;
  shape?: "circle" | "cover";
  size?: "sm" | "md";
}) {
  const safeSrc = getSafeImageSrc(src);
  const [failed, setFailed] = useState(false);
  const box =
    shape === "cover"
      ? size === "sm"
        ? "h-8 w-6 rounded-sm"
        : "h-10 w-[30px] rounded-sm"
      : size === "sm"
        ? "h-8 w-8 rounded-full"
        : "h-10 w-10 rounded-full";
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-n-surface text-sm font-bold text-n-slate",
        box,
      )}
    >
      {safeSrc && !failed ? (
        <Image
          src={safeSrc}
          alt=""
          fill
          sizes="40px"
          className="object-cover"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{Array.from(name)[0]?.toUpperCase() ?? "?"}</span>
      )}
    </span>
  );
}
