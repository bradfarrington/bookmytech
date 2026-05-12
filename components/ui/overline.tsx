import { cn } from "@/lib/utils";

// Matches the proposal's slate-muted overline (text-text-muted).
// Note: docs/03-design-system.md says brand-blue — that's an unintentional
// docs/proposal divergence. We're following the proposal per project owner.
export interface OverlineProps {
  children: React.ReactNode;
  className?: string;
}

export function Overline({ children, className }: OverlineProps) {
  return (
    <p
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
