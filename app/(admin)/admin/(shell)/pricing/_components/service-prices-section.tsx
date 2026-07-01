"use client";

import { updateServiceDuration, updateServiceCommission } from "@/app/actions/pricing";
import { InlineNumber } from "./inline-edit";
import { hours, percent } from "./converters";
import { formatPrice } from "@/lib/utils";

export interface ServicePriceRow {
  id: string;
  name: string;
  duration_hours: number | null;
  starting_price_pence: number;
  commission_rate: number | null;
}

export function ServicePricesSection({
  services,
  defaultRatePct,
  hourlyRatePence,
}: {
  services: ServicePriceRow[];
  defaultRatePct: number;
  hourlyRatePence: number;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">
          Durations &amp; commission
        </h2>
        <p className="text-sm text-text-muted">
          Labour is the service duration × the global hourly rate (
          {formatPrice(hourlyRatePence)}/hr). The price shown is that product;
          edit the duration to change it. Leave commission blank to use the
          platform default ({defaultRatePct}%). Changes apply to new bookings only.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        <div className="grid grid-cols-[minmax(0,1.6fr)_120px_120px_160px] items-center gap-3 border-b border-border bg-surface px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <span>Service</span>
          <span>Duration</span>
          <span>Labour price</span>
          <span>Commission</span>
        </div>
        {services.map((s) => {
          const hrs = s.duration_hours ?? null;
          const labourPence =
            hrs != null ? Math.round(hrs * hourlyRatePence) : s.starting_price_pence;
          return (
            <div
              key={s.id}
              className="grid grid-cols-[minmax(0,1.6fr)_120px_120px_160px] items-center gap-3 border-b border-border-subtle px-5 py-2 text-sm last:border-b-0"
            >
              <span className="font-medium text-text-primary">{s.name}</span>
              <InlineNumber
                value={hrs}
                {...hours}
                ariaLabel={`${s.name} duration`}
                onSave={(v) => updateServiceDuration(s.id, v ?? 0)}
              />
              <span className="tabular-nums text-text-muted">
                {formatPrice(labourPence)}
              </span>
              <InlineNumber
                value={s.commission_rate}
                {...percent}
                clearable
                placeholder={`Default (${defaultRatePct}%)`}
                ariaLabel={`${s.name} commission`}
                onSave={(v) => updateServiceCommission(s.id, v)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
