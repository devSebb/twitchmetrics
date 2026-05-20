"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import type { Platform } from "@twitchmetrics/database";

const PLATFORM_ICON_SRC: Partial<Record<Platform, string>> = {
  twitch: "/platform-icons/twitch.png",
  youtube: "/platform-icons/youtube.png",
  instagram: "/platform-icons/instagram.png",
  tiktok: "/platform-icons/tiktok.png",
  x: "/platform-icons/x_white.png",
  kick: "/platform-icons/kick.png",
};

const SIZE_CLASSES = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
} as const;

type PlatformIconSize = keyof typeof SIZE_CLASSES;

type PlatformIconProps = {
  platform: Platform;
  size?: PlatformIconSize;
  className?: string;
  /** Use rounded-full for circles, rounded-lg for squares. Default: rounded-full for sm/xs, rounded-lg for md/lg */
  rounded?: "full" | "lg" | "none";
};

export function PlatformIcon({
  platform,
  size = "sm",
  className,
  rounded,
}: PlatformIconProps) {
  const config = PLATFORM_CONFIG[platform];
  const sizeClass = SIZE_CLASSES[size];
  const roundedClass =
    rounded ?? (size === "xs" || size === "sm" ? "full" : "lg");
  const roundedCn =
    roundedClass === "full"
      ? "rounded-full"
      : roundedClass === "lg"
        ? "rounded-lg"
        : "";

  const iconSrc = PLATFORM_ICON_SRC[platform];
  const pxSize =
    size === "xs" ? 16 : size === "sm" ? 20 : size === "md" ? 24 : 32;

  // Kick logo has no built-in outline — wrap it in a green-bordered circle to
  // match the login screen treatment.
  if (platform === "kick" && iconSrc) {
    const innerPx = Math.round(pxSize * 0.62);
    const borderWidth = size === "xs" || size === "sm" ? 1.5 : 2;
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full flex-shrink-0",
          sizeClass,
          className,
        )}
        style={{ border: `${borderWidth}px solid ${config.color}` }}
        title={config.name}
      >
        <Image
          src={iconSrc}
          alt={config.name}
          width={innerPx}
          height={innerPx}
          className="object-contain"
          style={{ width: innerPx, height: innerPx }}
        />
      </span>
    );
  }

  if (iconSrc) {
    return (
      <Image
        src={iconSrc}
        alt={config.name}
        width={pxSize}
        height={pxSize}
        className={cn(
          sizeClass,
          roundedCn,
          "flex-shrink-0 object-contain",
          className,
        )}
        title={config.name}
      />
    );
  }

  // Fallback for any platform without an asset: letter in colored circle
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white flex-shrink-0",
        sizeClass,
        roundedCn,
        className,
      )}
      style={{ backgroundColor: config.color ?? "#383A40" }}
      title={config.name}
    >
      {config.name.charAt(0)}
    </span>
  );
}
