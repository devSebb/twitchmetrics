import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-[#E32C19] text-white hover:bg-[#C72615] active:bg-[#B02010] focus-visible:ring-[#E32C19]/50",
  secondary:
    "bg-[#383A40] text-[#DBDEE1] hover:bg-[#4E5058] active:bg-[#56585F] focus-visible:ring-[#383A40]/50",
  ghost:
    "bg-transparent text-[#949BA4] hover:bg-[#383A40] hover:text-[#DBDEE1] focus-visible:ring-[#383A40]/50",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-lg",
  lg: "h-11 px-6 text-base rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B2D31] disabled:pointer-events-none disabled:opacity-50",
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);
