import {
  Wrench,
  Search,
  Disc,
  BatteryCharging,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPrice } from "@/lib/utils";

// Fallback seed used until the admin services CRUD is built and the table is
// populated. The icon and "most picked" flag are landing-page concerns, so
// they're keyed by slug here rather than added as columns to the services
// table — admin shouldn't care about marketing flags.
type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  starting_price_pence: number;
};

const SEED_SERVICES: ServiceRow[] = [
  { id: "seed-full-service", slug: "full-service", name: "Full Service", starting_price_pence: 11900 },
  { id: "seed-diagnostic", slug: "diagnostic", name: "Diagnostic", starting_price_pence: 4500 },
  { id: "seed-brakes-tyres", slug: "brakes-tyres", name: "Brakes & Tyres", starting_price_pence: 7500 },
  { id: "seed-battery", slug: "battery", name: "Battery", starting_price_pence: 8500 },
  { id: "seed-clutch-gears", slug: "clutch-gears", name: "Clutch & Gears", starting_price_pence: 18000 },
  { id: "seed-mot-precheck", slug: "mot-precheck", name: "MOT Pre-check", starting_price_pence: 3900 },
];

const SERVICE_META: Record<string, { icon: LucideIcon; featured?: boolean }> = {
  "full-service": { icon: Wrench },
  diagnostic: { icon: Search, featured: true },
  "brakes-tyres": { icon: Disc },
  battery: { icon: BatteryCharging },
  "clutch-gears": { icon: Settings },
  "mot-precheck": { icon: ShieldCheck },
};

const FALLBACK_ICON: LucideIcon = Wrench;

async function loadServices(): Promise<ServiceRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("services")
      .select("id, name, slug, starting_price_pence")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(6);

    if (error || !data || data.length === 0) return SEED_SERVICES;
    return data;
  } catch {
    return SEED_SERVICES;
  }
}

export async function ServicesPreview() {
  const services = await loadServices();

  return (
    <section id="services" className="bg-surface">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[56px]">
        <div className="mx-auto mb-9 max-w-[600px] text-center">
          <Overline className="mb-2 text-brand-blue">Services</Overline>
          <h2 className="mb-2 text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
            Fixed prices on the things that matter.
          </h2>
          <p className="text-base text-text-secondary">
            Every job priced up front, parts and labour included. Pick what you
            need, see the price, book a mechanic.
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const meta = SERVICE_META[s.slug] ?? { icon: FALLBACK_ICON };
            return (
              <li key={s.id}>
                <Card
                  className={cn(
                    "flex h-full items-start gap-3.5",
                    meta.featured && "border-brand-blue bg-blue-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      meta.featured ? "bg-brand-blue" : "bg-blue-50",
                    )}
                  >
                    <Icon
                      icon={meta.icon}
                      size={20}
                      className={meta.featured ? "text-white" : "text-brand-blue"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold tracking-[-0.01em] text-text-primary">
                        {s.name}
                      </h3>
                      {meta.featured && (
                        <Pill tone="accent">Most picked</Pill>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-text-muted">
                      From{" "}
                      <span className="font-bold text-text-primary">
                        {formatPrice(s.starting_price_pence)}
                      </span>
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
