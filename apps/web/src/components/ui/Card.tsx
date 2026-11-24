import { cn } from "@/lib/utils";

type CardProps = {
  className?: string;
  children: React.ReactNode;
  appearance?: "noticed";
};

export function Card({
  className,
  children,
  appearance: _appearance,
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-n-line bg-white p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
