import { calcEarnings } from "@/lib/earnings";
import { formatPrice } from "@/lib/utils";

// Earnings breakdown for the job-detail view. Pure presentational. Commission
// is on the WHOLE total (owner decision) so the platform fee never changes with
// sourcing — only the parts money moves:
//   - self-sourced parts stay in the payout (the mechanic fronts & keeps them)
//   - BMT-sourced parts come OFF the payout (BMT supplies & keeps that money)
// So: You receive = total − fee − (BMT-sourced parts). Matches the
// mechanic_payout_pence the server recomputes on every sourcing change.
// Commission rate is whatever is locked on the booking, never hardcoded.

export function EarningsBreakdown({
  totalPence,
  commissionRate,
  partsPence = 0,
  bmtPartsPence = 0,
}: {
  totalPence: number;
  commissionRate: number;
  /** Total parts on the booking (BMT price). */
  partsPence?: number;
  /** Of which is being ordered via BMT (comes off the payout). */
  bmtPartsPence?: number;
}) {
  const e = calcEarnings(totalPence, commissionRate);
  const ratePct = Math.round(e.commissionRate * 1000) / 10; // 0.15 → 15
  const selfParts = Math.max(0, partsPence - bmtPartsPence);
  const youReceive = Math.max(0, e.customerPence - e.platformFeePence - bmtPartsPence);

  return (
    <div className="space-y-2.5">
      <BreakdownRow label="Customer pays" value={formatPrice(e.customerPence)} />
      <BreakdownRow
        label={`Platform fee (${ratePct}%)`}
        value={`– ${formatPrice(e.platformFeePence)}`}
        muted
      />
      {bmtPartsPence > 0 && (
        <BreakdownRow
          label="Parts ordered via BMT"
          value={`– ${formatPrice(bmtPartsPence)}`}
          muted
          hint="BMT supplies these — their cost comes off your payout"
        />
      )}
      <div className="my-1 border-t border-border" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-text-primary">You receive</span>
        <span className="text-2xl font-extrabold tracking-tight text-success">
          {formatPrice(youReceive)}
        </span>
      </div>
      {selfParts > 0 && (
        <p className="text-xs text-text-muted">
          Includes {formatPrice(selfParts)} for parts you source yourself.
        </p>
      )}
      <p className="text-xs text-text-muted">
        Paid out after the customer signs off the completed job.
      </p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  muted,
  hint,
}: {
  label: string;
  value: string;
  muted?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-text-secondary">
        {label}
        {hint && <span className="ml-1 block text-[11px] text-text-muted">{hint}</span>}
      </span>
      <span
        className={
          muted
            ? "text-sm font-medium tabular-nums text-text-muted"
            : "text-sm font-semibold tabular-nums text-text-primary"
        }
      >
        {value}
      </span>
    </div>
  );
}
