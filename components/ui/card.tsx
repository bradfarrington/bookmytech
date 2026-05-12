import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** When false, removes the default padding so children can control their own layout. */
  padded?: boolean;
}

export function Card({ children, padded = true, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface-card shadow-card",
        padded && "p-6",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
