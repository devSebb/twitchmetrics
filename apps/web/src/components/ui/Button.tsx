import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  appearance?: "noticed";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      appearance: _appearance,
      className,
      disabled,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
          "n-button",
          variant === "primary"
            ? "n-button-primary"
            : variant === "secondary"
              ? "n-button-secondary"
              : "text-n-slate hover:bg-n-surface",
          size === "lg" && "!px-7 !text-base",
          size === "sm" && "!px-4",
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);
