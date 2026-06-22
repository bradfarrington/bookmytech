import Link from "next/link";
import {
  Wrench,
  Search,
  Disc,
  BatteryCharging,
  Settings,
  ShieldCheck,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { Reveal } from "@/components/ui/reveal";
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

// Fallback seed mirrors the top 6 services from `supabase/migrations/0001_seed_services.sql`
// so this preview renders sensibly even if the DB read fails. Slugs match the
// SERVICE_META map below; prices are kept in sync with the seed.
const SEED_SERVICES: ServiceRow[] = [
  { id: "seed-full-service",        slug: "full-service",        name: "Full Service",        starting_price_pence: 18900 },
  { id: "seed-diagnostic",          slug: "diagnostic",          name: "Diagnostic",          starting_price_pence: 4500 },
  { id: "seed-front-brake-pads",    slug: "front-brake-pads",    name: "Front Brake Pads",    starting_price_pence: 13900 },
  { id: "seed-battery-replacement", slug: "battery-replacement", name: "Battery Replacement", starting_price_pence: 12400 },
  { id: "seed-clutch-replacement",  slug: "clutch-replacement",  name: "Clutch Replacement",  starting_price_pence: 29800 },
  { id: "seed-mot-precheck",        slug: "mot-precheck",        name: "MOT Pre-check",       starting_price_pence: 5900 },
];

const SERVICE_META: Record<string, { icon: LucideIcon; featured?: boolean }> = {
  "full-service": { icon: Wrench },
  diagnostic: { icon: Search, featured: true },
  "front-brake-pads": { icon: Disc },
  "front-brake-discs-pads": { icon: Disc },
  "battery-replacement": { icon: BatteryCharging },
  "clutch-replacement": { icon: Settings },
  "mot-precheck": { icon: ShieldCheck },
  "interim-service": { icon: Wrench },
  "cambelt-replacement": { icon: Settings },
  "air-con-regas": { icon: Wrench },
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
        <Reveal className="mx-auto mb-9 max-w-[600px] text-center">
          <Overline className="mb-2 text-brand-blue">Services</Overline>
          <h2 className="mb-2 text-[32px] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[40px]">
            Fixed prices on the things that matter.
          </h2>
          <p className="text-base text-text-secondary">
            Every job priced up front, parts and labour included. Pick what you
            need, see the price, book a mechanic.
          </p>
        </Reveal>

        <Reveal as="ul" stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const meta = SERVICE_META[s.slug] ?? { icon: FALLBACK_ICON };
            return (
              <li key={s.id} className="h-full">
                <Link href="/book" className="block h-full" aria-label={`Book ${s.name}`}>
                  <Card
                    className={cn(
                      "flex h-full items-start gap-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-blue/50",
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
                </Link>
              </li>
            );
          })}
        </Reveal>

        <div className="mt-9 flex justify-center">
          <Link
            href="/services"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue transition-colors hover:text-brand-blue-dark"
          >
            View all services
            <Icon icon={ArrowRight} size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
