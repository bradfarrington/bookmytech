import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import {
  CategoryForm,
  type CategoryFormValues,
} from "../../../_components/category-form";

export default async function AdminCategoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select("id, name, slug, description, display_order, is_active")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const category = data as CategoryFormValues;

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
          Edit {category.name}
        </h1>
        <p className="mt-1.5 font-mono text-sm text-text-muted">
          {category.slug}
        </p>
      </header>

      <CategoryForm
        mode="edit"
        defaultDisplayOrder={category.display_order}
        category={category}
      />
    </div>
  );
}
