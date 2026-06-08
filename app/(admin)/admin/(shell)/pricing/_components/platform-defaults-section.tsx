"use client";

import { updatePlatformSetting } from "@/app/actions/pricing";
import { InlineNumber } from "./inline-edit";
import { pounds, percent } from "./converters";

export interface PlatformSettings {
  take_rate_base: number;
  take_rate_pro: number;
  cancel_fee_before_24h: number;
  cancel_fee_within_24h: number;
  cancel_fee_mechanic_en_route: number;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function PlatformDefaultsSection({ settings }: { settings: PlatformSettings }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Default commission rates */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text-primary">
            Default commission
          </h2>
          <p className="text-sm text-text-muted">
            Fallback rates used when a service has no rate of its own.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <Row label="Base take rate" hint="Standard mechanics">
            <InlineNumber
              value={settings.take_rate_base}
              {...percent}
              ariaLabel="Base take rate"
              onSave={(v) => updatePlatformSetting("take_rate_base", v ?? 0)}
            />
          </Row>
          <Row label="Pro take rate" hint="Applied to Pro-tier mechanics">
            <InlineNumber
              value={settings.take_rate_pro}
              {...percent}
              ariaLabel="Pro take rate"
              onSave={(v) => updatePlatformSetting("take_rate_pro", v ?? 0)}
            />
          </Row>
        </div>
      </section>

      {/* Cancellation fee tiers */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text-primary">
            Cancellation fees
          </h2>
          <p className="text-sm text-text-muted">
            Charged to the customer depending on when they cancel.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <Row label="More than 24h before" hint="Plenty of notice">
            <InlineNumber
              value={settings.cancel_fee_before_24h}
              {...pounds}
              ariaLabel="Fee more than 24h before"
              onSave={(v) => updatePlatformSetting("cancel_fee_before_24h", v ?? 0)}
            />
          </Row>
          <Row label="Within 24h" hint="Short notice">
            <InlineNumber
              value={settings.cancel_fee_within_24h}
              {...pounds}
              ariaLabel="Fee within 24h"
              onSave={(v) => updatePlatformSetting("cancel_fee_within_24h", v ?? 0)}
            />
          </Row>
          <Row label="Mechanic en route" hint="Mechanic already on the way">
            <InlineNumber
              value={settings.cancel_fee_mechanic_en_route}
              {...pounds}
              ariaLabel="Fee mechanic en route"
              onSave={(v) => updatePlatformSetting("cancel_fee_mechanic_en_route", v ?? 0)}
            />
          </Row>
        </div>
      </section>
    </div>
  );
}
