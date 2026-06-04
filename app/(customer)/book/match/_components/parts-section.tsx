import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";

export interface PartLine {
  name: string;
  quantity: number;
  unitPricePence: number;
  totalPence: number;
}

// Shows the parts a service includes, itemised, so the customer sees exactly
// what the fixed price covers before they commit. Only the BMT (sale) price is
// ever shown — supplier cost / margin never leave the platform.
export function PartsSection({
  parts,
  labourPence,
  totalPence,
}: {
  parts: PartLine[];
  labourPence: number;
  totalPence: number;
}) {
  if (parts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Package size={16} className="text-brand-blue" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          What&apos;s included
        </h2>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">Labour</dt>
          <dd className="font-semibold tabular-nums text-text-primary">
            {formatPrice(labourPence)}
          </dd>
        </div>
        {parts.map((p, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <dt className="text-text-secondary">
              {p.name}
              {p.quantity > 1 && (
                <span className="ml-1 text-text-muted">× {p.quantity}</span>
              )}
            </dt>
            <dd className="font-semibold tabular-nums text-text-primary">
              {formatPrice(p.totalPence)}
            </dd>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
          <dt className="font-bold text-text-primary">Fixed price</dt>
          <dd className="text-base font-extrabold tabular-nums text-text-primary">
            {formatPrice(totalPence)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-text-muted">
        Parts and labour included — no hidden extras, no call-out fee.
      </p>
    </div>
  );
}
