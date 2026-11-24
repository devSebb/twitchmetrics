"use client";
import Image from "next/image";
import { useState } from "react";
import { getSafeImageSrc } from "@/lib/safeImage";
import { cn } from "@/lib/utils";

export function CreatorPortrait({
  src,
  name,
  className,
  priority = false,
}: {
  src: string | null;
  name: string;
  className?: string;
  priority?: boolean;
}) {
  const safeSrc = getSafeImageSrc(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-n-surface text-2xl font-bold text-n-ink",
        className,
      )}
    >
      {safeSrc && failedSrc !== safeSrc ? (
        <Image
          src={safeSrc}
          alt=""
          fill
          sizes="(min-width: 1024px) 128px, 96px"
          className="object-cover"
          priority={priority}
          onError={() => setFailedSrc(safeSrc)}
        />
      ) : (
        <span aria-hidden>{Array.from(name)[0]?.toUpperCase() ?? "?"}</span>
      )}
    </span>
  );
}
