"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Star, MapPin, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";

export interface MechanicRow {
  id: string;
  full_name: string | null;
  email: string;
  base_postcode: string | null;
  status: "online" | "offline" | "on_job";
  rating: number;
  job_count: number;
  is_pro: boolean;
  service_radius_miles: number;
  approved_at: string | null;
}

interface MechanicsTableProps {
  mechanics: MechanicRow[];
}

type StatusFilter = "all" | "online" | "offline" | "on_job";

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "on_job", label: "On job" },
];

function statusTone(status: MechanicRow["status"]): "success" | "neutral" | "active" {
  if (status === "online") return "success";
  if (status === "on_job") return "active";
  return "neutral";
}

function statusLabel(status: MechanicRow["status"]): string {
  if (status === "on_job") return "On job";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function MechanicsTable({ mechanics }: MechanicsTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return mechanics;
    return mechanics.filter((m) => m.status === statusFilter);
  }, [mechanics, statusFilter]);

  if (mechanics.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-semibold text-text-secondary">No mechanics yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
          Click &quot;Add mechanic&quot; to create the first one. They&apos;ll
          receive an email invite with a magic-link sign-in.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTER_OPTIONS}
          aria-label="Filter by status"
          className="max-w-[200px]"
        />
        <p className="text-sm text-text-muted">
          {filtered.length} of {mechanics.length} mechanics
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              <tr>
                <th className="px-5 py-3">Mechanic</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Base</th>
                <th className="px-5 py-3">Rating</th>
                <th className="px-5 py-3">Jobs</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((mechanic) => (
                <tr key={mechanic.id} className="hover:bg-surface/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">
                        {mechanic.full_name ?? "—"}
                      </span>
                      {mechanic.is_pro && (
                        <Sparkles size={14} className="text-brand-blue" aria-label="Pro" />
                      )}
                    </div>
                    <p className="text-xs text-text-muted">{mechanic.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone={statusTone(mechanic.status)}>{statusLabel(mechanic.status)}</Pill>
                  </td>
                  <td className="px-5 py-3">
                    {mechanic.base_postcode ? (
                      <span className="inline-flex items-center gap-1.5 text-text-secondary">
                        <MapPin size={12} className="text-text-muted" />
                        <span className="font-bold uppercase tracking-[0.04em]">
                          {mechanic.base_postcode}
                        </span>
                        <span className="text-xs text-text-muted">
                          · {mechanic.service_radius_miles}mi
                        </span>
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {mechanic.rating > 0 ? (
                      <span className="inline-flex items-center gap-1 text-text-secondary">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        <span className="font-semibold">{mechanic.rating.toFixed(2)}</span>
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{mechanic.job_count}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/mechanics/${mechanic.id}`}
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
    </div>
  );
}
