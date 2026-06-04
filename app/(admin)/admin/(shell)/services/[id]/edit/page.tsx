import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import {
  ServiceForm,
  type CategoryOption,
  type ServiceFormValues,
} from "../../_components/service-form";
import {
  ServicePartsEditor,
  type AttachedPart,
  type CataloguePart,
} from "../../_components/service-parts-editor";

export default async function AdminServiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: service, error }, { data: categories }, { data: servicePartRows }, { data: catalogueRows }] =
    await Promise.all([
      supabase
        .from("services")
        .select(
          "id, name, slug, category, description, starting_price_pence, display_order, is_active",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("service_categories")
        .select("slug, name")
        .order("display_order", { ascending: true }),
      supabase
        .from("service_parts")
        .select("id, quantity, part:parts(id, name, sku, bmt_price_pence)")
        .eq("service_id", id),
      supabase
        .from("parts")
        .select("id, name, sku, bmt_price_pence")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  if (error || !service) {
    notFound();
  }

  const serviceData = service as ServiceFormValues;
  // Show every category in the edit dropdown (active or not) so the current
  // selection is always representable. The settings UI is the place to manage
  // which categories are available for new services.
  const categoryOptions: CategoryOption[] = (categories ?? []) as CategoryOption[];

  // Normalise the nested part relation (object or array) into the editor shape.
  type PartRel = { id: string; name: string; sku: string | null; bmt_price_pence: number };
  const attachedParts: AttachedPart[] = (
    (servicePartRows ?? []) as Array<{
      id: string;
      quantity: number;
      part: PartRel | PartRel[] | null;
    }>
  )
    .map((row) => {
      const part = Array.isArray(row.part) ? row.part[0] : row.part;
      if (!part) return null;
      return {
        id: row.id,
        partId: part.id,
        name: part.name,
        sku: part.sku,
        quantity: row.quantity,
        unitPricePence: part.bmt_price_pence,
      } satisfies AttachedPart;
    })
    .filter((x): x is AttachedPart => x !== null);

  const catalogue: CataloguePart[] = (
    (catalogueRows ?? []) as Array<{ id: string; name: string; sku: string | null; bmt_price_pence: number }>
  ).map((p) => ({ id: p.id, name: p.name, sku: p.sku, bmtPricePence: p.bmt_price_pence }));

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
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Edit {serviceData.name}
        </h1>
        <p className="mt-1.5 font-mono text-sm text-text-muted">
          {serviceData.slug}
        </p>
      </header>

      <ServiceForm
        mode="edit"
        defaultDisplayOrder={serviceData.display_order}
        categories={categoryOptions}
        service={serviceData}
      />

      <ServicePartsEditor
        serviceId={serviceData.id}
        attached={attachedParts}
        catalogue={catalogue}
      />
    </div>
  );
}
