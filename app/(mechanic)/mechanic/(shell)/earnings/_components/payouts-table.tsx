import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Landmark } from "lucide-react";
import { formatPrice } from "@/lib/utils";

// Renders payout history. When `live` is true the rows are real Stripe Connect
// transfers to the mechanic's connected account; otherwise they're a weekly-
// accrual preview (the mechanic hasn't connected Stripe yet), clearly marked.

export interface PayoutRow {
  id: string;
  /** Payout date label, e.g. "Mon 2 Jun". */
  dateLabel: string;
  amountPence: number;
  status: "paid" | "pending";
  /** Period covered label, e.g. "26 May – 1 Jun". */
  periodLabel: string;
  /** Masked account, e.g. "•••• 4242". */
  accountMask: string;
}

export function PayoutsTable({ rows, live = false }: { rows: PayoutRow[]; live?: boolean }) {
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-2.5 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-brand-blue" />
          <h2 className="text-[15px] font-bold text-text-primary">Recent payouts</h2>
        </div>
        {live ? (
          <Pill tone="success" dot>
            Live · paid via Stripe
          </Pill>
        ) : (
          <span className="text-[11px] font-medium text-text-muted">
            Preview — connect Stripe to see real payouts
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">
          No payouts yet. They&apos;ll appear here once you&apos;ve completed jobs and
          your payouts are switched on.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                <th className="px-5 py-2.5 font-semibold">Payout date</th>
                <th className="px-5 py-2.5 font-semibold">Period</th>
                <th className="px-5 py-2.5 font-semibold">Account</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border-subtle last:border-b-0"
                >
                  <td className="px-5 py-3 font-semibold text-text-primary">
                    {r.dateLabel}
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{r.periodLabel}</td>
                  <td className="px-5 py-3 font-mono text-text-secondary">
                    {r.accountMask}
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone={r.status === "paid" ? "success" : "pending"}>
                      {r.status === "paid" ? "Paid" : "Pending"}
                    </Pill>
                  </td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-text-primary">
                    {formatPrice(r.amountPence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
