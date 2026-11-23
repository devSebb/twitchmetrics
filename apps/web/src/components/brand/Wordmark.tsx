import { cn } from "@/lib/utils";

/** Temporary typographic lockup. Final artwork can replace this one component. */
export function Wordmark({
  attribution = true,
  className,
}: {
  attribution?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className="text-[2rem] font-black leading-none tracking-[-0.065em]">
        noticed<span className="text-n-red">.</span>
      </span>
      {attribution && (
        <span className="mt-1.5 text-xs font-normal tracking-normal text-n-slate">
          powered by <span className="font-bold">Hatchet</span>
        </span>
      )}
    </span>
  );
}
