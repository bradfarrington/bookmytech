import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { createClient } from "@/lib/supabase/server";
import type { ChecklistRow } from "@/lib/checklists/checklists";
import { ProductForm } from "../_components/product-form";

export const dynamic = "force-dynamic";

export default async function AdminServiceNewPage() {
  const supabase = await createClient();
  const { data: checklists } = await supabase.from("checklists").select("id, key, name, kind").order("name");
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
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Add product</h1>
      </header>
      <ProductForm mode="create" checklists={(checklists ?? []) as ChecklistRow[]} />
    </div>
  );
}
