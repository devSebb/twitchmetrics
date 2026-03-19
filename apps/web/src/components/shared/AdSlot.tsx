"use client";

import { useEffect, useRef, useState } from "react";

type AdSize = "leaderboard" | "medium-rectangle" | "sidebar";

const AD_DIMENSIONS: Record<AdSize, { width: number; height: number }> = {
  leaderboard: { width: 728, height: 90 },
  "medium-rectangle": { width: 300, height: 250 },
  sidebar: { width: 160, height: 600 },
};

interface AdSlotProps {
  size: AdSize;
  slotId: string;
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export function AdSlot({ size, slotId, className }: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasLoaded = useRef(false);

  const { width, height } = AD_DIMENSIONS[size];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || hasLoaded.current) return;
    hasLoaded.current = true;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense not loaded or blocked
    }
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width, height, minWidth: width, minHeight: height }}
    >
      {isVisible && (
        <ins
          className="adsbygoogle"
          style={{ display: "block", width, height }}
          data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </div>
  );
}
