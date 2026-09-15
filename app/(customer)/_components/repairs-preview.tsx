import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionWatermark } from "@/components/ui/section-watermark";
import { loadCatalogueProducts } from "@/lib/catalogue/load-products";
import {
  PRODUCT_CATEGORIES,
  REPAIRS_TOP_NODE,
  productBasePence,
  productsInCategory,
  toQuotableProduct,
  type ProductCategory,
} from "@/lib/catalogue/products";
import { getHourlyRatePence } from "@/lib/pricing/calculate";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn, formatPrice } from "@/lib/utils";

// "What we do" (Task 46): one gateway into the HaynesPro repair catalogue, plus
// the set-price services the admin manages at /admin/services
// (catalogue_products). Only active products appear, so switching a product off
// in the admin removes it here; the admin actions revalidate "/".
//
// catalogue_products is admin-only under RLS, so it's read here with the
// service-role client, server-side, selecting the same columns the booking
// funnel uses. A read failure shows the gateway on its own rather than failing
// the homepage.
//
// Every card links to /book?node=…, which carries the choice through the reg
// and vehicle steps (lib/bookings/start-node.ts). A product can't be priced
// exactly before the car is known: servicing adds engine oil per vehicle, so
// its price reads "+ oil".

const CATEGORY_ICONS: Record<ProductCategory, LucideIcon> = {
  diagnostics: Search,
  servicing: Wrench,
  inspection: ShieldCheck,
};

const POPULAR_REPAIRS = ["Brakes", "Clutch & transmission", "Suspension", "Battery & charging"];

interface ServiceCard {
  id: string;
  name: string;
  summary: string | null;
  price: string;
}

interface ServiceGroup {
  key: ProductCategory;
  id: string;
  label: string;
  blurb: string;
  from: string | null;
  products: ServiceCard[];
}

async function loadServiceGroups(): Promise<ServiceGroup[]> {
  try {
    const db = createAdminClient();
    const [rows, hourlyRatePence] = await Promise.all([
      loadCatalogueProducts(db),
      getHourlyRatePence(db),
    ]);
    return PRODUCT_CATEGORIES.map((category) => {
      const priced = productsInCategory(rows, category.key)
        .map(toQuotableProduct)
        .map((product) => ({ product, base: productBasePence(product, hourlyRatePence) }))
        .filter((p): p is { product: typeof p.product; base: number } => p.base != null);
      const lowest = priced.length ? Math.min(...priced.map((p) => p.base)) : null;
      const oil = priced.some((p) => p.product.includesEngineOil);
      return {
        key: category.key,
        id: category.id,
        label: category.label,
        blurb: category.blurb,
        from: lowest == null ? null : `${formatPrice(lowest)}${oil ? " + oil" : ""}`,
        products: priced.map(({ product, base }) => ({
          id: product.id,
          name: product.name,
          summary: product.summary,
          price: `${formatPrice(base)}${product.includesEngineOil ? " + oil" : ""}`,
        })),
      };
    }).filter((group) => group.products.length > 0);
  } catch (err) {
    console.error("[homepage] services load failed:", err);
    return [];
  }
}

const bookHref = (node: string) => `/book?node=${encodeURIComponent(node)}`;

export async function RepairsPreview() {
  const groups = await loadServiceGroups();

  return (
    // Dark band: the one strong change of surface in the middle of the page,
    // between the light how-it-works timeline and the mechanics panel.
    // overflow-clip, not overflow-hidden: hidden would make the section a
    // scroll container and stop the gateway card from sticking.
    <section
      id="repairs"
      className="relative scroll-mt-[68px] overflow-clip bg-surface-dark text-white"
    >
      <SectionWatermark tone="dark" />
      <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          tone="dark"
          align="left"
          eyebrow="What we do"
          title="Everything your car needs, without the garage."
          lead="Book any repair, priced from the manufacturer's repair times for your exact car, or one of our set-price services."
        />

        <div
          className={cn(
            "grid gap-5",
            groups.length > 0 && "min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]",
          )}
        >
          {/* Natural height, pinned under the nav on desktop while the
              category panels scroll past, so it never stretches into an empty
              card beside them. */}
          <Reveal className="relative flex flex-col overflow-hidden rounded-[24px] bg-[linear-gradient(160deg,#1e3a8a_0%,#2563eb_100%)] p-7 shadow-[0_20px_60px_rgba(37,99,235,0.3)] sm:p-8 min-[1000px]:sticky min-[1000px]:top-[92px] min-[1000px]:self-start">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-inset ring-white/20">
              <Icon icon={Wrench} size={22} strokeWidth={2} />
            </span>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-200">
              Repairs
            </p>
            <h3 className="mt-2 font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              Book a specific repair
            </h3>
            <p className="mt-3 text-[15px] leading-[1.55] text-white/80">
              {REPAIRS_TOP_NODE.summary}.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {POPULAR_REPAIRS.map((name) => (
                <li
                  key={name}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/15"
                >
                  {name}
                </li>
              ))}
              <li className="rounded-full px-1 py-1.5 text-xs font-semibold text-white/70">
                and every other repair
              </li>
            </ul>
            <div className="pt-8">
              <Link href={bookHref(REPAIRS_TOP_NODE.id)}>
                <Button
                  variant="secondary"
                  size="lg"
                  iconRight={ArrowRight}
                  className="border-transparent bg-white font-bold text-brand-blue-dark hover:bg-surface"
                >
                  Find your repair
                </Button>
              </Link>
              <p className="mt-3 text-xs text-white/60">
                Enter your reg to see every repair for your car, with prices.
              </p>
            </div>
          </Reveal>

          {groups.length > 0 && (
            <Reveal stagger className="flex flex-col gap-4">
              {groups.map((group) => (
                <div
                  key={group.key}
                  className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-200">
                        <Icon icon={CATEGORY_ICONS[group.key]} size={20} strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold">{group.label}</h3>
                        <p className="text-[13px] leading-[1.45] text-white/60">{group.blurb}</p>
                      </div>
                    </div>
                    {group.from && (
                      <span className="hidden shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white min-[561px]:inline">
                        From {group.from}
                      </span>
                    )}
                  </div>

                  {/* Phones: one compact row per product (name, price), so nine
                      products don't stack into a wall of cards. Wider: three
                      cards across with the summary. */}
                  <ul className="mt-4 flex flex-col divide-y divide-white/10 min-[561px]:grid min-[561px]:grid-cols-3 min-[561px]:gap-2 min-[561px]:divide-y-0">
                    {group.products.map((product) => (
                      <li key={product.id}>
                        <Link
                          href={bookHref(group.id)}
                          aria-label={`Book ${product.name}, ${product.price}`}
                          className="flex h-full items-center justify-between gap-3 py-2.5 transition-colors hover:text-blue-200 min-[561px]:flex-col min-[561px]:items-start min-[561px]:justify-start min-[561px]:gap-0 min-[561px]:rounded-xl min-[561px]:border min-[561px]:border-white/10 min-[561px]:bg-white/[0.03] min-[561px]:px-4 min-[561px]:py-3 min-[561px]:hover:border-blue-300/50 min-[561px]:hover:bg-white/[0.08]"
                        >
                          <span className="text-sm font-bold text-white">{product.name}</span>
                          {product.summary && (
                            <span className="mt-1 hidden text-xs leading-[1.45] text-white/55 min-[561px]:line-clamp-2">
                              {product.summary}
                            </span>
                          )}
                          <span className="inline-flex shrink-0 items-center gap-1 font-display text-base font-extrabold text-blue-200 min-[561px]:mt-auto min-[561px]:pt-2.5">
                            {product.price}
                            <Icon icon={ArrowRight} size={14} strokeWidth={2.5} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
