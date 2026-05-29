"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { formatPrice } from "@/lib/utils";
import { subscribeToBookings } from "@/lib/supabase/realtime";

export interface MonitorRow {
  id: string;
  service: string;
  customer: string;
  mechanic: string | null;
  area: string | null;
  status: string;
  totalPence: number;
}

type Tab = "all" | "live" | "pending" | "complete" | "disputed";

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "live", label: "Live" },
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "disputed", label: "Disputed" },
  { value: "all", label: "All" },
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
  return "neutral"; // cancelled
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

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function LiveMonitor({ rows }: { rows: MonitorRow[] }) {
  const [tab, setTab] = useState<Tab>("live");
  const router = useRouter();

  // Re-run the server component on any bookings change so KPIs, this table,
  // and the demand chart all refresh together from a single source of truth.
  useEffect(() => {
    return subscribeToBookings(() => router.refresh());
  }, [router]);

  const filtered = useMemo(
    () => rows.filter((r) => matchesTab(r.status, tab)),
    [rows, tab],
  );

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-brand-blue" />
          <h2 className="text-sm font-bold tracking-tight text-text-primary">
            Live monitor
          </h2>
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors " +
                (tab === t.value
                  ? "bg-brand-blue text-white"
                  : "text-text-muted hover:bg-surface hover:text-text-secondary")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-semibold text-text-secondary">
            Nothing here right now
          </p>
          <p className="mt-1 text-sm text-text-muted">
            No bookings match the “{TABS.find((t) => t.value === tab)?.label}” filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              <tr>
                <th className="px-5 py-3">Ref</th>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Mechanic</th>
                <th className="px-5 py-3">Area</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-surface/50">
                  <td className="px-5 py-3 font-mono text-xs text-text-muted">
                    {shortId(r.id)}
                  </td>
                  <td className="px-5 py-3 font-semibold text-text-primary">
                    {r.service}
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{r.customer}</td>
                  <td className="px-5 py-3 text-text-secondary">
                    {r.mechanic ?? (
                      <span className="text-text-muted">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {r.area ? (
                      <span className="font-bold uppercase tracking-[0.04em] text-text-secondary">
                        {r.area}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone={statusTone(r.status)}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Pill>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-text-primary">
                    {formatPrice(r.totalPence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
