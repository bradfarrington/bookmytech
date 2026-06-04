import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import { ServicePricesSection, type ServicePriceRow } from "./_components/service-prices-section";
import { AreasSection, type AreaRowData } from "./_components/areas-section";
import { OverridesSection, type CellData } from "./_components/overrides-section";
import {
  PlatformDefaultsSection,
  type PlatformSettings,
} from "./_components/platform-defaults-section";

export const dynamic = "force-dynamic";

const SETTING_DEFAULTS: PlatformSettings = {
  take_rate_base: 0.15,
  take_rate_pro: 0.12,
  cancel_fee_before_24h: 0,
  cancel_fee_within_24h: 3000,
  cancel_fee_mechanic_en_route: 5000,
};

export default async function AdminPricingPage() {
  const supabase = await createClient();

  const [{ data: services }, { data: areas }, { data: cells }, { data: settingRows }] =
    await Promise.all([
      supabase
        .from("services")
        .select("id, name, starting_price_pence, commission_rate, display_order")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("areas")
        .select("id, name, postcode_prefixes, labour_multiplier, is_active")
        .order("name", { ascending: true }),
      supabase
        .from("service_area_prices")
        .select("service_id, area_id, override_price_pence, parts_price_pence, commission_rate"),
      supabase.from("platform_settings").select("key, value"),
    ]);

  const serviceRows = (services ?? []) as ServicePriceRow[];
  // Default area sorts last so the catch-all sits at the bottom of the table.
  const areaRows = ((areas ?? []) as AreaRowData[]).sort((a, b) =>
    a.name === "Default" ? 1 : b.name === "Default" ? -1 : a.name.localeCompare(b.name),
  );
  const cellRows = (cells ?? []) as CellData[];

  const settings: PlatformSettings = { ...SETTING_DEFAULTS };
  for (const row of settingRows ?? []) {
    const key = row.key as keyof PlatformSettings;
    const n = typeof row.value === "number" ? row.value : Number(row.value);
    if (key in settings && Number.isFinite(n)) settings[key] = n;
  }

  const defaultRatePct = Math.round(settings.take_rate_base * 1000) / 10;

  return (
    <div className="space-y-10">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Pricing
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Base prices, commission, area multipliers, overrides and cancellation
          fees. All edits are audited and apply to new bookings only — existing
          bookings keep the rate snapshotted at the time they were made.
        </p>
      </header>

      <ServicePricesSection services={serviceRows} defaultRatePct={defaultRatePct} />
      <AreasSection areas={areaRows} />
      <OverridesSection
        services={serviceRows.map((s) => ({ id: s.id, name: s.name }))}
        areas={areaRows.map((a) => ({ id: a.id, name: a.name }))}
        cells={cellRows}
      />
      <PlatformDefaultsSection settings={settings} />
    </div>
  );
}
