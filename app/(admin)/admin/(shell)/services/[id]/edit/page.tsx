import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import type { CatalogueProductRow } from "@/lib/catalogue/products";
import type { ChecklistRow } from "@/lib/checklists/checklists";
import { ProductForm } from "../../_components/product-form";

export const dynamic = "force-dynamic";

export default async function AdminServiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: product, error }, { data: checklists }] = await Promise.all([
    supabase
      .from("catalogue_products")
      .select(
        "id, category, name, summary, description, price_pence, labour_hours, duration_hours, includes_engine_oil, display_order, is_active, checklist_id, checklist_tier",
      )
      .eq("id", id)
      .single(),
    supabase.from("checklists").select("id, key, name, kind").order("name"),
  ]);
  if (error || !product) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/services"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to services
        </Link>
      </div>
      <header>
        <Overline>Commercial · Services</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Edit {product.name}</h1>
      </header>
      <ProductForm
        mode="edit"
        product={product as CatalogueProductRow}
        checklists={(checklists ?? []) as ChecklistRow[]}
      />
    </div>
  );
}
