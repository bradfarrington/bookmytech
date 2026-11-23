"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updatePlatformSetting, updateRepairCombineMode } from "@/app/actions/pricing";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { RepairCombineMode } from "@/lib/pricing/calculate";
import { InlineNumber } from "./inline-edit";
import { pounds, percent } from "./converters";

export interface PlatformSettings {
  take_rate_base: number;
  take_rate_pro: number;
  hourly_rate_pence: number;
  cancel_fee_before_24h: number;
  cancel_fee_within_24h: number;
  cancel_fee_mechanic_en_route: number;
  /** How several repairs booked together are timed (Task 24). */
  repair_combine_mode: RepairCombineMode;
  /** Engine oil on a servicing product (Task 31): £/litre and the litres assumed when HaynesPro has no figure. */
  engine_oil_price_per_litre_pence: number;
  engine_oil_default_litres: number;
  /** What a mechanic may charge when the customer declines the revised job on site (Task 37). */
  on_site_diagnostic_fee_pence: number;
  /** A markup on every part priced into a repair (2026-11-18): 1 on, 0 off. */
  parts_markup_enabled: number;
  /** The markup as a decimal: 0.2 = 20%. */
  parts_markup_rate: number;
  /** Air-con refrigerant, pence per 100 g (2026-11-23). 0 = not set: the job goes to a quote. */
  refrigerant_r134a_price_per_100g_pence: number;
  refrigerant_r1234yf_price_per_100g_pence: number;
}

/** A markup percentage: 0–100%, stored as a decimal. */
const markupPercent = {
  toInput: (rate: number) => String(Math.round(rate * 1000) / 10),
  toDisplay: (rate: number | null) => (rate == null ? "Not set" : `${Math.round(rate * 1000) / 10}%`),
  parse: (raw: string): number | null => {
    const n = Number(raw.replace("%", "").trim());
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return Math.round(n * 10) / 1000;
  },
};

function PartsMarkupSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={on}
      disabled={pending}
      label="Mark up parts"
      onChange={(next) => {
        setOn(next);
        startTransition(async () => {
          const result = await updatePlatformSetting("parts_markup_enabled", next ? 1 : 0);
          if (!result.ok) {
            setOn(!next);
            toast.error(result.error);
            return;
          }
          toast.success(next ? "Parts markup on. Applies to new quotes." : "Parts markup off. Parts are charged at cost.");
        });
      }}
    />
  );
}

const litres = {
  toInput: (l: number) => String(Math.round(l * 10) / 10),
  toDisplay: (l: number | null) => (l == null ? "Not set" : `${Math.round(l * 10) / 10} L`),
  parse: (raw: string): number | null => {
    const n = Number(raw.replace(/l$/i, "").trim());
    if (!Number.isFinite(n) || n < 0 || n > 30) return null;
    return Math.round(n * 10) / 10;
  },
};

const COMBINE_OPTIONS: ReadonlyArray<SelectOption<RepairCombineMode>> = [
  { value: "sum", label: "Add each job's book time" },
  { value: "haynespro", label: "HaynesPro combined (overlap removed)" },
];

function CombineModeSelect({ initial }: { initial: RepairCombineMode }) {
  const [mode, setMode] = useState<RepairCombineMode>(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={mode}
      onChange={(next) => {
        const previous = mode;
        setMode(next);
        startTransition(async () => {
          const result = await updateRepairCombineMode(next);
          if (!result.ok) {
            setMode(previous);
            toast.error(result.error);
            return;
          }
          toast.success("Saved. Applies to new quotes.");
        });
      }}
      options={COMBINE_OPTIONS}
      aria-label="Several jobs in one booking"
      className={pending ? "opacity-60" : undefined}
    />
  );
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
            Labour rate &amp; commission
          </h2>
          <p className="text-sm text-text-muted">
            The global hourly rate that drives every service price, plus the
            fallback commission rates used when a service has none of its own.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <Row label="Hourly labour rate" hint="Global: every service's price = duration × this">
            <InlineNumber
              value={settings.hourly_rate_pence}
              {...pounds}
              ariaLabel="Hourly labour rate"
              onSave={(v) => updatePlatformSetting("hourly_rate_pence", v ?? 0)}
            />
          </Row>
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
          <Row
            label="Mark up parts"
            hint="On: every NAPA part in a repair's price is marked up by the percentage below (not estimates or set prices). Off: NAPA's cost"
          >
            <PartsMarkupSwitch initial={settings.parts_markup_enabled === 1} />
          </Row>
          <Row label="Parts markup" hint="Added to each NAPA part's cost when the switch above is on, e.g. 20% makes a £50 part £60">
            <InlineNumber
              value={settings.parts_markup_rate}
              {...markupPercent}
              ariaLabel="Parts markup percentage"
              onSave={(v) => updatePlatformSetting("parts_markup_rate", v ?? 0)}
            />
          </Row>
          <Row
            label="Several jobs in one booking"
            hint="Add every job's book time, or let HaynesPro remove the overlap (e.g. pads add nothing once the discs are off)"
          >
            <CombineModeSelect initial={settings.repair_combine_mode} />
          </Row>
        </div>
      </section>

      {/* Engine oil on a service (Task 31) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text-primary">Engine oil</h2>
          <p className="text-sm text-text-muted">
            A service adds engine oil at this price per litre × the manufacturer&apos;s
            stated capacity for the customer&apos;s car (from HaynesPro). Fixed-price
            products themselves are set under Services.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <Row label="Engine oil per litre" hint="Charged on every servicing product that includes oil">
            <InlineNumber
              value={settings.engine_oil_price_per_litre_pence}
              {...pounds}
              ariaLabel="Engine oil price per litre"
              onSave={(v) => updatePlatformSetting("engine_oil_price_per_litre_pence", v ?? 0)}
            />
          </Row>
          <Row label="Default quantity" hint="Used when HaynesPro has no oil capacity for the car (never on an electric car)">
            <InlineNumber
              value={settings.engine_oil_default_litres}
              {...litres}
              ariaLabel="Default engine oil litres"
              onSave={(v) => updatePlatformSetting("engine_oil_default_litres", v ?? 0)}
            />
          </Row>
        </div>
      </section>

      {/* Air-con refrigerant, by weight (2026-11-23) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text-primary">Air-con refrigerant</h2>
          <p className="text-sm text-text-muted">
            An air-con regas, or any air-con repair, adds refrigerant at this price per 100 g × the
            manufacturer&apos;s stated charge for the customer&apos;s car (from HaynesPro). NAPA doesn&apos;t
            sell refrigerant. Cars from 2017 run on R1234yf; when HaynesPro and the car&apos;s age
            can&apos;t settle which gas, the dearer one is charged. Until a gas has a price, a job that
            needs it goes to a quote.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <Row label="R1234yf per 100 g" hint="Most cars registered from 2017">
            <InlineNumber
              value={settings.refrigerant_r1234yf_price_per_100g_pence || null}
              {...pounds}
              ariaLabel="R1234yf refrigerant price per 100 g"
              onSave={(v) => updatePlatformSetting("refrigerant_r1234yf_price_per_100g_pence", v ?? 0)}
            />
          </Row>
          <Row label="R134a per 100 g" hint="Older cars">
            <InlineNumber
              value={settings.refrigerant_r134a_price_per_100g_pence || null}
              {...pounds}
              ariaLabel="R134a refrigerant price per 100 g"
              onSave={(v) => updatePlatformSetting("refrigerant_r134a_price_per_100g_pence", v ?? 0)}
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
          <Row
            label="On-site diagnostic"
            hint="When the mechanic finds the booked repair isn't what's needed and the customer declines the revised job, the mechanic may charge this or the en-route fee"
          >
            <InlineNumber
              value={settings.on_site_diagnostic_fee_pence}
              {...pounds}
              ariaLabel="On-site diagnostic fee"
              onSave={(v) => updatePlatformSetting("on_site_diagnostic_fee_pence", v ?? 0)}
            />
          </Row>
        </div>
      </section>
    </div>
  );
}
