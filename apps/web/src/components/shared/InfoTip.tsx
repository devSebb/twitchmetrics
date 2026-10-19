"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Question } from "@phosphor-icons/react";
import type { MetricInfo } from "@/lib/constants/metric-info";

const CARD_WIDTH = 272;
const VIEWPORT_MARGIN = 8;
const GAP = 6;
// Hover in after a beat so sweeping the cursor across a row of tiles doesn't
// flash every card; hover out after a beat so the cursor can reach the card.
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 120;

type Position = { top: number; left: number; placement: "above" | "below" };

/**
 * A small "?" beside a number that explains what the number is and where it
 * comes from. Opens on hover, keyboard focus or tap; Escape or a click
 * elsewhere closes it.
 *
 * The card is portalled to <body> with fixed positioning, so a card inside a
 * scrolling or overflow-hidden widget is never clipped. It sits above the
 * trigger, or below when there is no room, and stays inside the viewport.
 */
export function InfoTip({
  info,
  className,
}: {
  info: MetricInfo;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const schedule = useCallback((next: boolean, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    const anchor = trigger.getBoundingClientRect();
    const height = card.offsetHeight;
    const roomAbove = anchor.top - GAP - VIEWPORT_MARGIN;
    const placement = roomAbove >= height ? "above" : "below";
    const top =
      placement === "above" ? anchor.top - GAP - height : anchor.bottom + GAP;
    const centred = anchor.left + anchor.width / 2 - CARD_WIDTH / 2;
    const left = Math.min(
      Math.max(centred, VIEWPORT_MARGIN),
      window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN,
    );
    setPosition({ top, left, placement });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        cardRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const details = [
    { label: "Source", value: info.source },
    ...(info.window ? [{ label: "Period", value: info.window }] : []),
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About ${info.title}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") schedule(true, OPEN_DELAY_MS);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") schedule(false, CLOSE_DELAY_MS);
        }}
        onFocus={() => schedule(true, 0)}
        onBlur={() => schedule(false, CLOSE_DELAY_MS)}
        onClick={(event) => {
          // Inside clickable cards and links, the "?" is not a click on them.
          event.preventDefault();
          event.stopPropagation();
          schedule(!open, 0);
        }}
        className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[#6D6F78] transition-colors hover:text-[#DBDEE1] focus-visible:text-[#DBDEE1] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5865F2] ${className ?? ""}`}
      >
        <Question size={13} weight="bold" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={cardRef}
            id={id}
            role="tooltip"
            onPointerEnter={() => schedule(true, 0)}
            onPointerLeave={() => schedule(false, CLOSE_DELAY_MS)}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: CARD_WIDTH,
              // Measured first, shown once placed: no flash at the corner.
              visibility: position ? "visible" : "hidden",
            }}
            className="fixed z-[100] rounded-lg border border-[#3F4147] bg-[#111214] p-3 text-left shadow-xl shadow-black/40"
          >
            <p className="text-xs font-semibold text-[#F2F3F5]">{info.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#B5BAC1]">
              {info.body}
            </p>
            <dl className="mt-2.5 space-y-1.5 border-t border-[#2B2D31] pt-2.5">
              {details.map((row) => (
                <div key={row.label} className="flex gap-2">
                  <dt className="w-12 flex-shrink-0 pt-px text-[10px] font-medium uppercase tracking-wide text-[#949BA4]">
                    {row.label}
                  </dt>
                  <dd className="text-[11px] leading-snug text-[#DBDEE1]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>,
          document.body,
        )}
    </>
  );
}
