import type { Metadata } from "next";
import Link from "next/link";
import {
  Wrench,
  Search,
  Disc,
  CircleDot,
  BatteryCharging,
  Settings,
  ShieldCheck,
  Snowflake,
  ArrowRight,
  Check,
  type LucideIcon,
} from "lucide-react";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";
import { Footer } from "../_components/footer";

export const metadata: Metadata = {
  title: "Services & pricing — Book My Tech",
  description:
    "Browse every job Book My Tech mechanics carry out, with fixed prices including parts and labour. No call-out fees, no surprises.",
};

// Per-category icon so each group reads at a glance. Keyed by the category
// slug stored on `services.category` (a soft reference to service_categories).
const CATEGORY_ICON: Record<string, LucideIcon> = {
  service: Wrench,
  diagnostic: Search,
  brakes: Disc,
  tyres: CircleDot,
  battery: BatteryCharging,
  clutch: Settings,
  mot: ShieldCheck,
  other: Snowflake,
};

const FALLBACK_ICON: LucideIcon = Wrench;

type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  starting_price_pence: number;
};

type CategoryRow = { slug: string; name: string; display_order: number };

type Group = { slug: string; name: string; services: ServiceRow[] };

async function loadCatalogue(): Promise<Group[]> {
  const supabase = await createClient();

  const [{ data: services }, { data: categories }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, slug, category, description, starting_price_pence")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("service_categories")
      .select("slug, name, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  if (!services || services.length === 0) return [];

  // Build an ordered, labelled bucket per category from the admin-managed
  // categories table, then drop each service into its bucket. Anything whose
  // category slug has no matching (or no) category row collects under "Other".
  const cats = (categories ?? []) as CategoryRow[];
  const order = new Map(cats.map((c, i) => [c.slug, i]));
  const buckets = new Map<string, Group>();
  for (const c of cats) buckets.set(c.slug, { slug: c.slug, name: c.name, services: [] });

  for (const s of services as ServiceRow[]) {
    const key = s.category && buckets.has(s.category) ? s.category : "__other";
    if (!buckets.has(key)) buckets.set(key, { slug: "__other", name: "Other services", services: [] });
    buckets.get(key)!.services.push(s);
  }

  return [...buckets.values()]
    .filter((g) => g.services.length > 0)
    .sort((a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999));
}

const INCLUDED = [
  "Genuine or OE-quality parts",
  "All labour and call-out",
  "12-month parts & labour guarantee",
  "Pay only when the job's done",
];

export default async function ServicesPage() {
  const groups = await loadCatalogue();
  const total = groups.reduce((n, g) => n + g.services.length, 0);

  return (
    <>
      <section className="bg-brand-gradient text-white">
        <CustomerNav active="Services" dark />
        <div className="mx-auto max-w-content px-4 pb-16 pt-10 text-center sm:px-8 lg:pb-20 lg:pt-14">
          <Overline className="mb-3 text-white/70">Services &amp; pricing</Overline>
          <h1 className="mx-auto mb-4 max-w-3xl text-[34px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[44px] lg:text-[52px]">
            Fixed prices on every job. Parts and labour included.
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-base text-white/85 sm:text-lg">
            {total > 0
              ? `Browse all ${total} services our vetted mechanics carry out at your door. Every price is the price you pay — no call-out fees, no surprises on the invoice.`
              : "Our vetted mechanics carry out a full range of jobs at your door — every price fixed up front, parts and labour included."}
          </p>
          <div className="flex justify-center">
            <Link href="/book">
              <Button
                variant="secondary"
                size="lg"
                iconRight={ArrowRight}
                className="border-transparent bg-white text-brand-blue hover:bg-white/90"
              >
                Get your fixed price
              </Button>
            </Link>
          </div>
          <ul className="mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Icon icon={Check} size={15} className="text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="bg-surface">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[64px]">
          {groups.length === 0 ? (
            <p className="text-center text-text-secondary">
              Our services are being updated. Please{" "}
              <Link href="/book" className="font-semibold text-brand-blue hover:underline">
                start a booking
              </Link>{" "}
              to see live pricing for your vehicle.
            </p>
          ) : (
            <div className="flex flex-col gap-14">
              {groups.map((group) => {
                const groupIcon = CATEGORY_ICON[group.slug] ?? FALLBACK_ICON;
                return (
                  <section key={group.slug} aria-labelledby={`cat-${group.slug}`}>
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50">
                        <Icon icon={groupIcon} size={20} className="text-brand-blue" />
                      </div>
                      <h2
                        id={`cat-${group.slug}`}
                        className="text-2xl font-extrabold tracking-[-0.02em] text-text-primary"
                      >
                        {group.name}
                      </h2>
                    </div>

                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {group.services.map((s) => (
                        <li key={s.id} className="h-full">
                          <Link
                            href="/book"
                            className="block h-full"
                            aria-label={`Book ${s.name}`}
                          >
                            <Card className="flex h-full flex-col transition-all hover:-translate-y-0.5 hover:border-brand-blue/50">
                              <h3 className="text-base font-bold tracking-[-0.01em] text-text-primary">
                                {s.name}
                              </h3>
                              {s.description && (
                                <p className="mt-1.5 flex-1 text-[13px] leading-[1.5] text-text-muted">
                                  {s.description}
                                </p>
                              )}
                              <div className="mt-4 flex items-center justify-between">
                                <p className="text-[13px] text-text-muted">
                                  From{" "}
                                  <span className="text-base font-bold text-text-primary">
                                    {formatPrice(s.starting_price_pence)}
                                  </span>
                                </p>
                                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-blue">
                                  Book
                                  <Icon icon={ArrowRight} size={14} />
                                </span>
                              </div>
                            </Card>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          <div className="mt-16 rounded-3xl bg-brand-gradient px-6 py-12 text-center text-white sm:px-10">
            <h2 className="mx-auto max-w-xl text-[28px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[34px]">
              Can&apos;t see your job? We probably do it.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-white/85">
              Pop in your reg and tell us what&apos;s wrong — we&apos;ll match the right
              specialist and show you a fixed price before you commit.
            </p>
            <div className="mt-7 flex justify-center">
              <Link href="/book">
                <Button
                  variant="secondary"
                  size="lg"
                  iconRight={ArrowRight}
                  className="border-transparent bg-white text-brand-blue hover:bg-white/90"
                >
                  Book a mechanic
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
