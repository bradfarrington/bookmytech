import { calcEarnings } from "@/lib/earnings";
import { formatPrice } from "@/lib/utils";

// Earnings breakdown for the job-detail view. Pure presentational — the maths
// lives in lib/earnings.ts so KPIs, offer cards and this card always agree.
// The commission rate is whatever is locked on the booking (bookings.commission_rate),
// never a hardcoded 15% (Pro-tier mechanics get a lower rate — Task 11).

export function EarningsBreakdown({
  totalPence,
  commissionRate,
  partsPence = 0,
}: {
  totalPence: number;
  commissionRate: number;
  partsPence?: number;
}) {
  const e = calcEarnings(totalPence, commissionRate, partsPence);
  const ratePct = Math.round(e.commissionRate * 1000) / 10; // 0.15 → 15

  return (
    <div className="space-y-2.5">
      <BreakdownRow label="Customer pays" value={formatPrice(e.customerPence)} />
      <BreakdownRow
        label="Parts cost"
        value={e.partsPence ? `– ${formatPrice(e.partsPence)}` : "£0.00"}
        muted
        hint={e.partsPence ? undefined : "Parts billing arrives in a later release"}
      />
      <BreakdownRow
        label={`Platform fee (${ratePct}%)`}
        value={`– ${formatPrice(e.platformFeePence)}`}
        muted
      />
      <div className="my-1 border-t border-border" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-text-primary">You receive</span>
        <span className="text-2xl font-extrabold tracking-tight text-success">
          {formatPrice(e.mechanicPence)}
        </span>
      </div>
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
