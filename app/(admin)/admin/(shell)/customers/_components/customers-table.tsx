"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { formatPrice } from "@/lib/utils";

export interface CustomerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  joined_at: string | null;
  last_sign_in_at: string | null;
  bookings_count: number;
  completed_count: number;
  total_spent_pence: number;
  last_booking_at: string | null;
  open_disputes: number;
}

export type SortKey = "recent" | "spend" | "jobs" | "name";
export type Segment = "all" | "active" | "never_booked" | "disputes";

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "recent", label: "Newest first" },
  { value: "spend", label: "Highest spend" },
  { value: "jobs", label: "Most jobs" },
  { value: "name", label: "Name A–Z" },
];

const SEGMENT_OPTIONS: ReadonlyArray<{ value: Segment; label: string }> = [
  { value: "all", label: "All customers" },
  { value: "active", label: "Has booked" },
  { value: "never_booked", label: "Never booked" },
  { value: "disputes", label: "Open disputes" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface CustomersTableProps {
  customers: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  sort: SortKey;
  segment: Segment;
}

// Filtering, sorting and paging all live in the URL — the server does the work
// in SQL, so this component only ever holds one page of rows.
export function CustomersTable({
  customers,
  total,
  page,
  pageSize,
  search,
  sort,
  segment,
}: CustomersTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(search);
  const [pending, startTransition] = useTransition();

  function hrefFor(changes: Record<string, string | number | undefined>): string {
    const next = new URLSearchParams();
    const merged = { q: search, sort, segment, page, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined || value === "" || value === "all") continue;
      if (key === "page" && Number(value) <= 1) continue;
      if (key === "sort" && value === "recent") continue;
      next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function navigate(changes: Record<string, string | number | undefined>) {
    startTransition(() => router.push(hrefFor(changes)));
  }

  // Debounce the search box so typing doesn't fire a query per keystroke.
  useEffect(() => {
    if (query === search) return;
    const t = setTimeout(() => navigate({ q: query, page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;
  const filtering = Boolean(search) || segment !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <span className="sr-only">Search customers</span>
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or phone"
            className="h-10 w-full rounded-button border border-border bg-surface-card pl-9 pr-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
          />
        </label>
        <Select<Segment>
          value={segment}
          onChange={(value) => navigate({ segment: value, page: 1 })}
          options={SEGMENT_OPTIONS}
          aria-label="Filter customers"
          className="max-w-[200px]"
        />
        <Select<SortKey>
          value={sort}
          onChange={(value) => navigate({ sort: value, page: 1 })}
          options={SORT_OPTIONS}
          aria-label="Sort customers"
          className="max-w-[180px]"
        />
        <p className="text-sm text-text-muted">
          {pending
            ? "Loading…"
            : total === 0
              ? "No matches"
              : `${firstRow}–${lastRow} of ${total} customer${total === 1 ? "" : "s"}`}
        </p>
      </div>

      {customers.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-semibold text-text-secondary">
            {filtering ? "No customers match" : "No customers yet"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            {filtering
              ? "Try a different search or filter."
              : "Customer accounts are created during the booking flow — the first booking will put someone here."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3">Jobs</th>
                  <th className="px-5 py-3">Spend</th>
                  <th className="px-5 py-3">Last booking</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-surface/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary">
                          {c.full_name ?? "Unnamed"}
                        </span>
                        {c.open_disputes > 0 && (
                          <Pill tone="error" title={`${c.open_disputes} open dispute(s)`}>
                            <AlertTriangle size={11} className="mr-1 inline" />
                            {c.open_disputes}
                          </Pill>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">{c.email ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{c.phone ?? "—"}</td>
                    <td className="px-5 py-3 text-text-secondary">
                      {formatDate(c.joined_at)}
                      {!c.last_sign_in_at && (
                        <span className="ml-1.5 text-xs text-text-muted">
                          · never signed in
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {c.bookings_count}
                      {c.bookings_count > 0 && (
                        <span className="ml-1 text-xs text-text-muted">
                          · {c.completed_count} done
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-semibold text-text-primary">
                      {formatPrice(c.total_spent_pence)}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {formatDate(c.last_booking_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="text-sm font-semibold text-brand-blue hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(hasPrev || hasNext) && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <Link
            href={hrefFor({ page: page - 1 })}
            aria-disabled={!hasPrev}
            tabIndex={hasPrev ? undefined : -1}
            className={
              hasPrev
                ? "inline-flex items-center gap-1 rounded-button border border-border bg-surface-card px-3 py-2 text-sm font-semibold text-text-secondary hover:border-brand-blue hover:text-brand-blue"
                : "pointer-events-none inline-flex items-center gap-1 rounded-button border border-border-subtle px-3 py-2 text-sm font-semibold text-text-disabled"
            }
          >
            <ChevronLeft size={14} /> Previous
          </Link>
          <span className="text-sm text-text-muted">
            Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <Link
            href={hrefFor({ page: page + 1 })}
            aria-disabled={!hasNext}
            tabIndex={hasNext ? undefined : -1}
            className={
              hasNext
                ? "inline-flex items-center gap-1 rounded-button border border-border bg-surface-card px-3 py-2 text-sm font-semibold text-text-secondary hover:border-brand-blue hover:text-brand-blue"
                : "pointer-events-none inline-flex items-center gap-1 rounded-button border border-border-subtle px-3 py-2 text-sm font-semibold text-text-disabled"
            }
          >
            Next <ChevronRight size={14} />
          </Link>
        </nav>
      )}
    </div>
  );
}
