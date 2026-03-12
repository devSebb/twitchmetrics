import { cn } from "@/lib/utils";

type CardProps = {
  className?: string;
  children: React.ReactNode;
};

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[#3F4147] bg-[#313338] p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
