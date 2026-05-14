import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import {
  CategoriesTable,
  type CategoryRow,
} from "./_components/categories-table";

export default async function AdminServicesSettingsPage() {
  const supabase = await createClient();

  const { data: categories, error } = await supabase
    .from("service_categories")
    .select("id, name, slug, display_order, is_active")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  // Count services per category slug. Done in JS rather than a SQL group-by
  // so we don't fight Supabase's REST shape — admin scale, small table.
  const { data: services } = await supabase.from("services").select("category");
  const counts = new Map<string, number>();
  for (const s of services ?? []) {
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }

  const rows: CategoryRow[] = (categories ?? []).map((c) => ({
    ...c,
    service_count: counts.get(c.slug) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/services"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to services
        </Link>
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial · Services · Settings</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Service settings
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            Manage the categories your services are grouped under. More
            settings live here as features grow.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load categories: {error.message}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-text-primary">
              Categories
            </h2>
            <p className="text-sm text-text-muted">
              Used in admin dropdowns and the booking flow. Slugs are
              auto-generated from the name and kept stable on edit.
            </p>
          </div>
          <Link href="/admin/services/settings/categories/new">
            <Button variant="primary" iconLeft={Plus}>
              Add category
            </Button>
          </Link>
        </div>

        <CategoriesTable categories={rows} />
      </section>
    </div>
  );
}
