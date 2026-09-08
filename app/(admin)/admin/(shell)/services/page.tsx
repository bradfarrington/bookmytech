import Link from "next/link";
import { ListChecks, Plus, PoundSterling } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import { PRODUCT_CATEGORIES, type CatalogueProductRow } from "@/lib/catalogue/products";
import { ProductsTable } from "./_components/products-table";

export const dynamic = "force-dynamic";

// The fixed-price products beside the HaynesPro repair tree (Task 31):
// diagnostics, servicing and pre-purchase inspections. Not the packaged
// catalogue Task 17 removed — repairs stay HaynesPro-priced; these are the
// things HaynesPro can't price.

export default async function AdminServicesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogue_products")
    .select(
      "id, category, name, summary, description, price_pence, labour_hours, duration_hours, includes_engine_oil, display_order, is_active",
    )
    .order("category")
    .order("display_order");
  const rows = (data ?? []) as CatalogueProductRow[];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Services</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            Diagnostics, servicing and pre-purchase inspections at a set price — the things the
            manufacturer&apos;s repair times don&apos;t cover. Customers see them beside Repairs at the
            top of the catalogue. A service that includes engine oil adds it at the per-litre price
            under{" "}
            <Link href="/admin/pricing" className="font-semibold text-brand-blue hover:underline">
              Pricing
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/services/checklists">
            <Button variant="ghost" iconLeft={ListChecks}>
              Checklists
            </Button>
          </Link>
          <Link href="/admin/pricing">
            <Button variant="ghost" iconLeft={PoundSterling}>
              Oil price
            </Button>
          </Link>
          <Link href="/admin/services/new">
            <Button variant="primary" iconLeft={Plus}>
              Add product
            </Button>
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load products: {error.message}
        </div>
      )}

      {PRODUCT_CATEGORIES.map((category) => (
        <section key={category.key} className="space-y-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-text-primary">{category.label}</h2>
            <p className="text-sm text-text-muted">{category.blurb}</p>
          </div>
          <ProductsTable products={rows.filter((r) => r.category === category.key)} />
        </section>
      ))}
    </div>
  );
}
