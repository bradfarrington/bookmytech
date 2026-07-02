"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { formatPrice, formatJobNumber } from "@/lib/utils";

export interface BookingRow {
  id: string;
  jobNumber: number | null;
  service: string;
  serviceId: string;
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
  services: ReadonlyArray<{ id: string; name: string }>;
  areas: readonly string[];
}

type Tab = "all" | "live" | "pending" | "complete" | "disputed";

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "disputed", label: "Disputed" },
];

const LIVE_STATUSES = new Set(["confirmed", "en_route", "in_progress"]);

function matchesTab(status: string, tab: Tab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "live":
      return LIVE_STATUSES.has(status);
    case "pending":
      return status === "sourcing_mechanic";
    case "complete":
      return status === "completed";
    case "disputed":
      return status === "disputed";
  }
}

function statusTone(status: string): "active" | "success" | "pending" | "error" | "neutral" {
  if (LIVE_STATUSES.has(status)) return "active";
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

export function BookingsTable({ bookings, services, areas }: BookingsTableProps) {
  const [tab, setTab] = useState<Tab>("all");
  const [area, setArea] = useState<string>("all");
  const [service, setService] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      if (!matchesTab(b.status, tab)) return false;
      if (area !== "all" && b.area !== area) return false;
      if (service !== "all" && b.serviceId !== service) return false;
      if (
        q &&
        !(
          formatJobNumber(b.jobNumber).includes(q) ||
          b.id.toLowerCase().includes(q) ||
          b.customer.toLowerCase().includes(q) ||
          b.vehicle.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [bookings, tab, area, service, query]);

  // CSV export mirrors the active filters; the route handler re-queries
  // server-side so PII is never assembled in the browser.
  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("tab", tab);
    if (area !== "all") params.set("area", area);
    if (service !== "all") params.set("service", service);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    return `/admin/jobs/export${qs ? `?${qs}` : ""}`;
  }, [tab, area, service, query]);

  const areaOptions = [
    { value: "all", label: "All areas" },
    ...areas.map((a) => ({ value: a, label: a })),
  ];
  const serviceOptions = [
    { value: "all", label: "All services" },
    ...services.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
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
            value={service}
            onChange={setService}
            options={serviceOptions}
            aria-label="Filter by service"
            className="max-w-[180px]"
          />
          <Select<string>
            value={area}
            onChange={setArea}
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
        {filtered.length} of {bookings.length} bookings
      </p>

      {filtered.length === 0 ? (
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
                  <th className="px-5 py-3">Service</th>
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
                {filtered.map((b) => (
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
    </div>
  );
}
