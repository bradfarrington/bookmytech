import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StarsProps {
  /** Rating out of 5. Rounded for filled-star count. */
  value: number;
  size?: number;
  className?: string;
}

export function Stars({ value, size = 12, className }: StarsProps) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      aria-label={`${value} out of 5 stars`}
      className={cn("inline-flex items-center gap-px", className)}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={1.5}
          className={cn(
            "shrink-0",
            i < filled
              ? "fill-warning text-warning"
              : "fill-transparent text-border",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
