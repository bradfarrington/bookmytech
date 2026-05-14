import Link from "next/link";
import { Plus, Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import {
  ServicesTable,
  type CategoryOption,
  type ServiceRow,
} from "./_components/services-table";

export default async function AdminServicesListPage() {
  const supabase = await createClient();

  const [{ data: services, error }, { data: categories }] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, slug, category, starting_price_pence, display_order, is_active",
      )
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("service_categories")
      .select("slug, name")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  const rows: ServiceRow[] = (services ?? []) as ServiceRow[];
  const categoryOptions: CategoryOption[] = (categories ?? []) as CategoryOption[];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Services
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            The bookable services catalogue. Customers see active services on
            the landing page and in the booking flow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/services/settings">
            <Button variant="ghost" iconLeft={SettingsIcon}>
              Settings
            </Button>
          </Link>
          <Link href="/admin/services/new">
            <Button variant="primary" iconLeft={Plus}>
              Add service
            </Button>
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load services: {error.message}
        </div>
      )}

      <ServicesTable services={rows} categories={categoryOptions} />
    </div>
  );
}
