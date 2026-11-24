import { cn } from "@/lib/utils";

type CardProps = {
  className?: string;
  children: React.ReactNode;
  appearance?: "legacy" | "noticed";
};

export function Card({
  className,
  children,
  appearance = "legacy",
}: CardProps) {
  return (
    <div
      className={cn(
        appearance === "noticed"
          ? "rounded-lg border border-n-line bg-white p-5 sm:p-6"
          : "rounded-lg border border-[#3F4147] bg-[#313338] p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
