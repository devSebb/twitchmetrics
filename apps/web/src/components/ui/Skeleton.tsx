import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
};

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#383A40]", className)}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}
