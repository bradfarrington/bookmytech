import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import {
  applyJobFilters,
  parseJobTab,
  sanitiseJobSearch,
  type JobTab,
} from "@/lib/admin/job-filters";
import { BookingsTable, type BookingRow } from "./_components/bookings-table";

// Every booking, filtered and paginated in SQL.
//
// This page used to read `.limit(1000)` and filter in JS, which meant booking
// 1001 silently disappeared from the list and its counts. Filters now go to
// Postgres (see lib/admin/job-filters.ts — shared with the CSV export so the two
// can't drift) and the page only ever holds one page of rows.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function vehicleLabel(reg: string | null, make: string | null, model: string | null): string {
  const parts = [make, model].filter(Boolean).join(" ");
  if (reg && parts) return `${reg} · ${parts}`;
  return reg || parts || "—";
}

interface AdminJobsPageProps {
  searchParams: Promise<{ tab?: string; area?: string; q?: string; page?: string }>;
}

export default async function AdminJobsPage({ searchParams }: AdminJobsPageProps) {
  const params = await searchParams;
  const tab: JobTab = parseJobTab(params.tab);
  const area = params.area && params.area !== "all" ? params.area : null;
  const search = sanitiseJobSearch(params.q);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const baseQuery = supabase
    .from("bookings")
    .select(
      "id, job_number, status, area, total_pence, customer_name, vehicle_reg, vehicle_make, vehicle_model, mechanic_id, repair_description, scheduled_at, created_at",
      { count: "exact" },
    );

  const {
    data: bookingsRaw,
    count,
    error,
  } = await applyJobFilters(baseQuery, { tab, area, search })
    .order("created_at", { ascending: false })
    // Stable tiebreak so paging can't repeat or skip a row.
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const bookings = bookingsRaw ?? [];
  const total = count ?? 0;

  // Only this page's mechanics — a handful of ids, not the whole roster.
  const mechanicIds = [...new Set(bookings.map((b) => b.mechanic_id).filter(Boolean))];
  const { data: mechProfiles } = mechanicIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", mechanicIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const mechanicName = new Map((mechProfiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: BookingRow[] = bookings.map((b) => ({
    id: b.id,
    jobNumber: b.job_number,
    service: b.repair_description ?? "Vehicle repair",
    customer: b.customer_name ?? "—",
    vehicle: vehicleLabel(b.vehicle_reg, b.vehicle_make, b.vehicle_model),
    area: b.area,
    mechanic: b.mechanic_id ? mechanicName.get(b.mechanic_id) ?? "Assigned" : null,
    status: b.status,
    totalPence: b.total_pence ?? 0,
    scheduledAt: b.scheduled_at,
  }));

  // Filter options come from a distinct-area view (0042) rather than whatever
  // rows this page happened to fetch.
  const { data: areaRows } = await supabase
    .from("booking_area_options")
    .select("area")
    .order("area", { ascending: true });
  const areas = (areaRows ?? [])
    .map((a) => a.area)
    .filter((a): a is string => Boolean(a));

  return (
    <div className="space-y-6">
      <header>
        <Overline>Operations</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          All jobs
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Every booking placed through Book My Tech. Click a row for full detail,
          timeline, and actions.
        </p>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load bookings: {error.message}
        </div>
      )}

      <BookingsTable
        bookings={rows}
        areas={areas}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        tab={tab}
        area={params.area ?? "all"}
        search={params.q ?? ""}
      />
    </div>
  );
}
