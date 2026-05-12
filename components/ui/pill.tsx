import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// All 9 tones from the proposal preserved; visuals match its hex palette
// translated into Tailwind utilities.
const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.01em]",
  {
    variants: {
      tone: {
        active: "bg-blue-100 text-brand-blue-dark",
        success: "bg-green-100 text-green-700",
        pending: "bg-amber-100 text-amber-700",
        error: "bg-red-100 text-red-700",
        neutral: "bg-border-subtle text-slate-700",
        info: "bg-indigo-100 text-indigo-800",
        accent: "bg-blue-50 text-brand-blue",
        dark: "bg-text-primary text-white",
        outline: "border-[1.5px] border-brand-blue bg-surface-card text-brand-blue",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface PillProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">,
    VariantProps<typeof pillVariants> {
  children: React.ReactNode;
  /** Show a small leading dot in the pill's current text colour. */
  dot?: boolean;
}

export function Pill({ tone, dot, className, children, ...rest }: PillProps) {
  return (
    <span className={cn(pillVariants({ tone }), className)} {...rest}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
