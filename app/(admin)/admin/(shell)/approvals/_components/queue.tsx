"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { StatusPill } from "./status-pill";

export interface QueueItem {
  id: string;
  fullName: string;
  postcode: string;
  status: string;
  submittedAt: string;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "needs_info", label: "Needs info" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

function timeSince(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ApprovalsQueue({
  items,
  activeFilter,
  selectedId,
}: {
  items: QueueItem[];
  activeFilter: string;
  selectedId: string | null;
}) {
  const pathname = usePathname();

  const filterHref = (value: string) =>
    value === "all" ? pathname : `${pathname}?status=${value}`;

  const itemHref = (id: string) => {
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("status", activeFilter);
    params.set("id", id);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={filterHref(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              activeFilter === f.value
                ? "bg-text-primary text-white"
                : "bg-surface-card text-text-secondary hover:bg-border-subtle",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface-card p-6 text-center text-sm text-text-muted">
            No applications here.
          </p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={itemHref(item.id)}
              className={cn(
                "block rounded-2xl border bg-surface-card p-4 shadow-card transition-colors",
                selectedId === item.id
                  ? "border-brand-blue ring-2 ring-brand-blue/15"
                  : "border-border hover:border-brand-blue/50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text-primary">{item.fullName}</p>
                  <p className="text-xs text-text-muted">
                    {item.postcode} · {timeSince(item.submittedAt)}
                  </p>
                </div>
                <StatusPill status={item.status} />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
