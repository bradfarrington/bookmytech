import type { LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

// All 7 variants from the proposal preserved. Improvements over the proposal:
//   - hover/active states (proposal had none — inline styles can't do :hover)
//   - focus-visible ring for keyboard accessibility
//   - disabled state styling
//   - type="button" default so a Button inside a <form> doesn't accidentally submit
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 rounded-button border border-transparent font-semibold leading-none",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ),
  {
    variants: {
      variant: {
        primary:
          "bg-brand-blue text-white hover:bg-brand-blue-dark",
        secondary:
          "border-brand-blue bg-surface-card text-brand-blue hover:bg-blue-50",
        tertiary:
          "bg-transparent text-brand-blue hover:bg-blue-50",
        ghost:
          "border-border bg-transparent text-slate-700 hover:bg-border-subtle",
        dark:
          "bg-text-primary text-white hover:bg-slate-800",
        success:
          "bg-success text-white hover:bg-green-600",
        destructive:
          "bg-danger text-white hover:bg-red-600",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-[22px] text-sm",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonVariants> {
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
}

export function Button({
  variant,
  size,
  fullWidth,
  iconLeft,
  iconRight,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {iconLeft && <Icon icon={iconLeft} size={iconSize} />}
      {children}
      {iconRight && <Icon icon={iconRight} size={iconSize} />}
    </button>
  );
}
