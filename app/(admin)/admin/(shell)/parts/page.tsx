import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import { PartsTable, type PartRow } from "./_components/parts-table";

export const dynamic = "force-dynamic";

export default async function AdminPartsListPage() {
  const supabase = await createClient();

  const { data: parts, error } = await supabase
    .from("parts")
    .select(
      "id, name, sku, category, supplier, supplier_cost_pence, bmt_price_pence, in_stock, is_active",
    )
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  const rows = (parts ?? []) as PartRow[];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Parts catalogue
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            The parts BMT sources on behalf of mechanics. Supplier cost and
            margin are platform-only — mechanics and customers only ever see the
            BMT price. Mechanics add parts to a job as needed; repairs are
            priced labour-only up front.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/parts/import">
            <Button variant="ghost" iconLeft={Upload}>
              Import CSV
            </Button>
          </Link>
          <Link href="/admin/parts/new">
            <Button variant="primary" iconLeft={Plus}>
              Add part
            </Button>
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load parts: {error.message}
        </div>
      )}

      <PartsTable parts={rows} />
    </div>
  );
}
