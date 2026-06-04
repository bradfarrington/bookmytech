"use client";

import { updateServiceBasePrice, updateServiceCommission } from "@/app/actions/pricing";
import { InlineNumber } from "./inline-edit";
import { pounds, percent } from "./converters";

export interface ServicePriceRow {
  id: string;
  name: string;
  starting_price_pence: number;
  commission_rate: number | null;
}

export function ServicePricesSection({
  services,
  defaultRatePct,
}: {
  services: ServicePriceRow[];
  defaultRatePct: number;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">
          Base prices &amp; commission
        </h2>
        <p className="text-sm text-text-muted">
          The starting (labour) price per service and its commission rate. Leave
          commission blank to use the platform default ({defaultRatePct}%).
          Changes apply to new bookings only.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        <div className="grid grid-cols-[minmax(0,1.6fr)_140px_160px] items-center gap-3 border-b border-border bg-surface px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <span>Service</span>
          <span>Base price</span>
          <span>Commission</span>
        </div>
        {services.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-[minmax(0,1.6fr)_140px_160px] items-center gap-3 border-b border-border-subtle px-5 py-2 text-sm last:border-b-0"
          >
            <span className="font-medium text-text-primary">{s.name}</span>
            <InlineNumber
              value={s.starting_price_pence}
              {...pounds}
              ariaLabel={`${s.name} base price`}
              onSave={(v) => updateServiceBasePrice(s.id, v ?? 0)}
            />
            <InlineNumber
              value={s.commission_rate}
              {...percent}
              clearable
              placeholder={`Default (${defaultRatePct}%)`}
              ariaLabel={`${s.name} commission`}
              onSave={(v) => updateServiceCommission(s.id, v)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
