"use client";

import Image from "next/image";
import React, { useState } from "react";
import { getSafeImageSrc } from "@/lib/safeImage";
import { cn } from "@/lib/utils";

type GameCoverImageProps = {
  src: string | null | undefined;
  name: string;
  sizes: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
  unoptimized?: boolean;
};

export function GameCoverImage({
  src,
  name,
  sizes,
  className,
  fallbackClassName,
  priority = false,
  unoptimized = false,
}: GameCoverImageProps) {
  const safeSrc = getSafeImageSrc(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const canRenderImage = safeSrc !== null && safeSrc !== failedSrc;

  if (!canRenderImage) {
    return (
      <div
        role="img"
        aria-label={`${name} cover unavailable`}
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#E32C19]/20 to-[#1E1F22] text-center text-[#949BA4]",
          fallbackClassName,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-1/4 min-h-4 w-1/4 min-w-4 max-w-10"
          aria-hidden="true"
        >
          <path d="M7 9h10M8 15h.01M16 15h.01M9 3h6l1 3h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h2l1-3Z" />
        </svg>
        <span className="px-1 text-[10px] font-medium leading-tight">
          Cover unavailable
        </span>
      </div>
    );
  }

  return (
    <Image
      src={safeSrc}
      alt={`${name} cover`}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized={unoptimized}
      onError={() => setFailedSrc(safeSrc)}
    />
  );
}
