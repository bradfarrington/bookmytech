import { formatPrice } from "@/lib/utils";

interface EarningsRingProps {
  /** Earned so far today, in pence. */
  valuePence: number;
  /** Daily goal, in pence. */
  targetPence: number;
  size?: number;
}

// Circular progress ring showing today's earnings against a daily goal. Pure
// SVG, no interactivity — safe to render on the server.
export function EarningsRing({ valuePence, targetPence, size = 104 }: EarningsRingProps) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = targetPence > 0 ? Math.min(1, valuePence / targetPence) : 0;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border-subtle"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-brand-blue transition-[stroke-dashoffset]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-extrabold leading-none tracking-tight text-text-primary">
          {formatPrice(valuePence)}
        </span>
        <span className="mt-0.5 text-[10px] font-medium text-text-muted">
          of {formatPrice(targetPence)}
        </span>
      </div>
    </div>
  );
}
