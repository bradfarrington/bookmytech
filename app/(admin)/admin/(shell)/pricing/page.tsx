import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import {
  DEFAULT_REPAIR_COMBINE_MODE,
  REPAIR_COMBINE_MODE_KEY,
  parseRepairCombineMode,
} from "@/lib/pricing/calculate";
import { AreasSection, type AreaRowData } from "./_components/areas-section";
import {
  PlatformDefaultsSection,
  type PlatformSettings,
} from "./_components/platform-defaults-section";

export const dynamic = "force-dynamic";

const SETTING_DEFAULTS: PlatformSettings = {
  take_rate_base: 0.15,
  take_rate_pro: 0.12,
  hourly_rate_pence: 6000,
  cancel_fee_before_24h: 0,
  cancel_fee_within_24h: 3000,
  cancel_fee_mechanic_en_route: 5000,
  repair_combine_mode: DEFAULT_REPAIR_COMBINE_MODE,
};

export default async function AdminPricingPage() {
  const supabase = await createClient();

  const [{ data: areas }, { data: settingRows }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name, postcode_prefixes, labour_multiplier, is_active")
      .order("name", { ascending: true }),
    supabase.from("platform_settings").select("key, value"),
  ]);

  // Default area sorts last so the catch-all sits at the bottom of the table.
  const areaRows = ((areas ?? []) as AreaRowData[]).sort((a, b) =>
    a.name === "Default" ? 1 : b.name === "Default" ? -1 : a.name.localeCompare(b.name),
  );

  const settings: PlatformSettings = { ...SETTING_DEFAULTS };
  for (const row of settingRows ?? []) {
    if (row.key === REPAIR_COMBINE_MODE_KEY) {
      settings.repair_combine_mode = parseRepairCombineMode(row.value);
      continue;
    }
    const key = row.key as Exclude<keyof PlatformSettings, "repair_combine_mode">;
    const n = typeof row.value === "number" ? row.value : Number(row.value);
    if (key in settings && Number.isFinite(n)) settings[key] = n;
  }

  return (
    <div className="space-y-10">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Pricing
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          The global hourly rate, commission, coverage areas and cancellation
          fees. Every booking is priced from the manufacturer&apos;s book time
          for the exact repair and vehicle: exact book-time hours (1-hour
          minimum) × the hourly rate. All edits are audited and apply to new
          bookings only — existing bookings keep the price snapshotted at the
          time they were made.
        </p>
      </header>

      <AreasSection areas={areaRows} />
      <PlatformDefaultsSection settings={settings} />
    </div>
  );
}
