import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getHourlyRatePence } from "@/lib/pricing/calculate";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import {
  ServiceForm,
  type CategoryOption,
} from "../_components/service-form";

export default async function AdminServiceCreatePage() {
  const supabase = await createClient();

  const [{ data: orderRow }, { data: categories }] = await Promise.all([
    supabase
      .from("services")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("service_categories")
      .select("slug, name")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  const nextDisplayOrder = (orderRow?.display_order ?? 0) + 1;
  const categoryOptions: CategoryOption[] = (categories ?? []) as CategoryOption[];
  const hourlyRatePence = await getHourlyRatePence(supabase);

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
          New service
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Add a bookable service to the catalogue. Set it inactive to keep it
          on file without exposing it to customers.
        </p>
      </header>

      {categoryOptions.length === 0 ? (
        <div className="rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No active categories yet.{" "}
          <Link
            href="/admin/services/settings/categories/new"
            className="font-semibold underline"
          >
            Create one first
          </Link>
          .
        </div>
      ) : (
        <ServiceForm
          mode="create"
          defaultDisplayOrder={nextDisplayOrder}
          categories={categoryOptions}
          hourlyRatePence={hourlyRatePence}
        />
      )}
    </div>
  );
}
