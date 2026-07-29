"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { formatPrice, formatJobNumber } from "@/lib/utils";
import { JOB_TABS, LIVE_STATUSES, type JobTab } from "@/lib/admin/job-filters";

export interface BookingRow {
  id: string;
  jobNumber: number | null;
  service: string;
  customer: string;
  vehicle: string;
  area: string | null;
  mechanic: string | null;
  status: string;
  totalPence: number;
  scheduledAt: string | null;
}

interface BookingsTableProps {
  bookings: BookingRow[];
  areas: readonly string[];
  total: number;
  page: number;
  pageSize: number;
  tab: JobTab;
  area: string;
  search: string;
}

const LIVE = new Set<string>(LIVE_STATUSES);

function statusTone(status: string): "active" | "success" | "pending" | "error" | "neutral" {
  if (LIVE.has(status)) return "active";
  if (status === "completed") return "success";
  if (status === "sourcing_mechanic") return "pending";
  if (status === "disputed") return "error";
  return "neutral";
}

const STATUS_LABEL: Record<string, string> = {
  sourcing_mechanic: "Sourcing",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Tab, area, search and page all live in the URL — the server filters and pages
// in SQL, so this component only ever holds one page of rows.
export function BookingsTable({
  bookings,
  areas,
  total,
  page,
  pageSize,
  tab,
  area,
  search,
}: BookingsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(search);
  const [pending, startTransition] = useTransition();

  function paramsFor(changes: Record<string, string | number | undefined>): URLSearchParams {
    const next = new URLSearchParams();
    const merged = { tab, area, q: search, page, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined || value === "" || value === "all") continue;
      if (key === "page" && Number(value) <= 1) continue;
      next.set(key, String(value));
    }
    return next;
  }

  function hrefFor(changes: Record<string, string | number | undefined>): string {
    const qs = paramsFor(changes).toString();
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

  // The export re-queries server-side with the same filters (minus paging), so
  // the CSV is the whole matching set, not just this page.
  const exportParams = paramsFor({ page: undefined });
  const exportQs = exportParams.toString();
  const exportHref = `/admin/jobs/export${exportQs ? `?${exportQs}` : ""}`;

  const areaOptions = [
    { value: "all", label: "All areas" },
    ...areas.map((a) => ({ value: a, label: a })),
  ];

  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-surface p-1">
          {JOB_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => navigate({ tab: t.value, page: 1 })}
              className={
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " +
                (tab === t.value
                  ? "bg-brand-blue text-white"
                  : "text-text-muted hover:text-text-secondary")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ref, customer, vehicle…"
              className="h-9 w-52 rounded-button border border-border bg-surface-card pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
            />
          </div>
          <Select<string>
            value={area}
            onChange={(value) => navigate({ area: value, page: 1 })}
            options={areaOptions}
            aria-label="Filter by area"
            className="max-w-[150px]"
          />
          <Link
            href={exportHref}
            prefetch={false}
            className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border bg-surface-card px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            <Download size={14} />
            Export CSV
          </Link>
        </div>
      </div>

      <p className="text-sm text-text-muted">
        {pending
          ? "Loading…"
          : total === 0
            ? "No bookings match"
            : `${firstRow}–${lastRow} of ${total} booking${total === 1 ? "" : "s"}`}
      </p>

      {bookings.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-semibold text-text-secondary">No bookings match</p>
          <p className="mt-1 text-sm text-text-muted">
            Try a different tab or clear the filters.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                <tr>
                  <th className="px-5 py-3">Ref</th>
                  <th className="px-5 py-3">Repair</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Vehicle</th>
                  <th className="px-5 py-3">Area</th>
                  <th className="px-5 py-3">Mechanic</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Scheduled</th>
                  <th className="px-5 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {bookings.map((b) => (
                  <tr key={b.id} className="cursor-pointer hover:bg-surface/50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/jobs/${b.id}`}
                        className="font-mono text-xs font-semibold text-brand-blue hover:underline"
                      >
                        #{formatJobNumber(b.jobNumber)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-semibold text-text-primary">
                      <Link href={`/admin/jobs/${b.id}`} className="hover:underline">
                        {b.service}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{b.customer}</td>
                    <td className="px-5 py-3 text-text-secondary">{b.vehicle}</td>
                    <td className="px-5 py-3">
                      {b.area ? (
                        <span className="font-bold uppercase tracking-[0.04em] text-text-secondary">
                          {b.area}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {b.mechanic ?? <span className="text-text-muted">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Pill tone={statusTone(b.status)}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </Pill>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {formatDate(b.scheduledAt)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-text-primary">
                      {formatPrice(b.totalPence)}
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
