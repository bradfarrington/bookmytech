import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { PartForm, type PartFormValues } from "../../_components/part-form";

export default async function AdminPartEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: part, error } = await supabase
    .from("parts")
    .select(
      "id, name, sku, category, supplier, description, supplier_cost_pence, bmt_price_pence, in_stock",
    )
    .eq("id", id)
    .single();

  if (error || !part) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/parts"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to parts
        </Link>
      </div>
      <header>
        <Overline>Commercial · Parts</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Edit {part.name}
        </h1>
        <p className="mt-1.5 font-mono text-sm text-text-muted">{part.sku}</p>
      </header>
      <PartForm mode="edit" part={part as PartFormValues} />
    </div>
  );
}
