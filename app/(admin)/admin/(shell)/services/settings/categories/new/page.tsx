import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { CategoryForm } from "../../_components/category-form";

export default async function AdminCategoryCreatePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_categories")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextDisplayOrder = (data?.display_order ?? 0) + 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/services/settings"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to settings
        </Link>
      </div>

      <header>
        <Overline>Commercial · Services · Settings · Categories</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          New category
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Add a category that services can be grouped under.
        </p>
      </header>

      <CategoryForm mode="create" defaultDisplayOrder={nextDisplayOrder} />
    </div>
  );
}
