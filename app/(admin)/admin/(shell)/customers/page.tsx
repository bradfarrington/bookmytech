import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Overline } from "@/components/ui/overline";
import {
  CustomersTable,
  type CustomerRow,
  type Segment,
  type SortKey,
} from "./_components/customers-table";

// Every customer account, with the job/spend/dispute rollups an admin needs to
// answer "who is this person and what's their history".
//
// Search, sort, aggregation and pagination all happen in SQL against the
// `customer_admin_summary` view (migration 0041). Nothing here reads the whole
// bookings table: an unbounded `.select()` would be silently capped at the
// project's max-rows setting and quietly produce wrong totals.
//
// Service-role read: the page is behind the proxy admin gate, and the view
// exposes auth.users columns that no RLS grant reaches.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const SORT_COLUMN: Record<SortKey, { column: string; ascending: boolean }> = {
  recent: { column: "joined_at", ascending: false },
  spend: { column: "total_spent_pence", ascending: false },
  jobs: { column: "bookings_count", ascending: false },
  name: { column: "full_name", ascending: true },
};

/**
 * PostgREST's `or=` filter is comma-delimited, so a comma or paren in the search
 * term would break out of the value and change the query. Strip them.
 */
function sanitiseSearch(raw: string): string {
  return raw.trim().replace(/[,()*\\]/g, "").slice(0, 80);
}

interface CustomersPageProps {
  searchParams: Promise<{ q?: string; sort?: string; segment?: string; page?: string }>;
}

export default async function AdminCustomersListPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const search = sanitiseSearch(params.q ?? "");
  const sort: SortKey =
    params.sort === "spend" || params.sort === "jobs" || params.sort === "name"
      ? params.sort
      : "recent";
  const segment: Segment =
    params.segment === "active" ||
    params.segment === "never_booked" ||
    params.segment === "disputes"
      ? params.segment
      : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();

  let query = admin
    .from("customer_admin_summary")
    .select(
      `id, full_name, phone, email, joined_at, last_sign_in_at,
       bookings_count, completed_count, total_spent_pence, last_booking_at, open_disputes`,
      { count: "exact" },
    );

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }
  if (segment === "active") query = query.gt("bookings_count", 0);
  if (segment === "never_booked") query = query.eq("bookings_count", 0);
  if (segment === "disputes") query = query.gt("open_disputes", 0);

  const { column, ascending } = SORT_COLUMN[sort];
  const {
    data,
    count,
    error,
  } = await query
    .order(column, { ascending, nullsFirst: false })
    // Stable tiebreak so paging can't show or skip the same row twice.
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const customers = (data ?? []) as CustomerRow[];
  const total = count ?? 0;

  // Historic guest bookings never linked to an account. Guest checkout is
  // retired so this only shrinks — but don't let those jobs be invisible here.
  // `head: true` means we get the count without reading a single row.
  const { count: orphanGuestBookings } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .is("customer_id", null);

  return (
    <div className="space-y-6">
      <header>
        <Overline>Network</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Customers
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Every customer account, their job history and spend. Open one to see
          their bookings, disputes and account credit.
        </p>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load customers: {error.message}
          {error.message.includes("customer_admin_summary") && (
            <> — has migration <code>0041</code> been applied?</>
          )}
        </div>
      )}

      {(orphanGuestBookings ?? 0) > 0 && (
        <div className="rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {orphanGuestBookings} legacy guest{" "}
          {orphanGuestBookings === 1 ? "booking isn't" : "bookings aren't"} linked
          to an account (placed before account-at-checkout). They&apos;re in{" "}
          <Link href="/admin/jobs" className="font-semibold underline">
            All jobs
          </Link>
          , and they attach to a customer here automatically if that email ever
          signs up.
        </div>
      )}

      <CustomersTable
        customers={customers}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        search={params.q ?? ""}
        sort={sort}
        segment={segment}
      />
    </div>
  );
}
