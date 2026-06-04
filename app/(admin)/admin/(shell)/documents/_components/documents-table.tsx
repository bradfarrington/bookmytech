"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MECHANIC_DOC_LABEL, type MechanicDocType } from "@/lib/onboarding/docs";
import { daysUntil, expiryState } from "@/lib/onboarding/expiry";
import { getMechanicDocumentUrl, reviewMechanicDocument } from "@/app/actions/documents";

export interface AdminDocRow {
  id: string;
  mechanicName: string;
  docType: MechanicDocType;
  status: "pending_review" | "verified" | "rejected" | "expired";
  expiresAt: string | null;
  uploadedAt: string;
}

type Filter = "all" | "needs_review" | "expiring" | "expired";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
];

const STATUS_LABEL: Record<AdminDocRow["status"], { label: string; className: string }> = {
  pending_review: { label: "Pending review", className: "bg-warning/15 text-warning" },
  verified: { label: "Verified", className: "bg-success/15 text-success" },
  rejected: { label: "Rejected", className: "bg-danger/15 text-danger" },
  expired: { label: "Expired", className: "bg-danger/15 text-danger" },
};

function matches(row: AdminDocRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "needs_review") return row.status === "pending_review";
  if (filter === "expired") return row.status === "expired" || expiryState(row.expiresAt) === "expired";
  if (filter === "expiring")
    return row.status === "verified" && expiryState(row.expiresAt) === "expiring_soon";
  return true;
}

function expiryText(row: AdminDocRow): string {
  if (!row.expiresAt) return "—";
  const d = daysUntil(row.expiresAt);
  const date = new Date(row.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (d != null && d < 0) return `${date} (expired)`;
  if (d != null && d <= 30) return `${date} (${d}d)`;
  return date;
}

export function DocumentsTable({ rows }: { rows: AdminDocRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("needs_review");
  const [opening, setOpening] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => rows.filter((r) => matches(r, filter)), [rows, filter]);

  async function view(id: string) {
    setOpening(id);
    const result = await getMechanicDocumentUrl(id);
    setOpening(null);
    if (!result.ok) return toast.error(result.error);
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function review(id: string, decision: "verified" | "rejected") {
    setActing(id);
    startTransition(async () => {
      const result = await reviewMechanicDocument(id, decision);
      setActing(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(decision === "verified" ? "Document approved." : "Document rejected.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = rows.filter((r) => matches(r, f.value)).length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                filter === f.value
                  ? "bg-text-primary text-white"
                  : "bg-surface-card text-text-secondary hover:bg-border-subtle",
              )}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <Card padded={false} className="overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">No documents match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Mechanic</th>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const meta = STATUS_LABEL[row.status];
                return (
                  <tr key={row.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{row.mechanicName}</td>
                    <td className="px-4 py-3 text-text-secondary">{MECHANIC_DOC_LABEL[row.docType]}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.className)}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{expiryText(row)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => view(row.id)}
                          disabled={opening === row.id}
                          className="inline-flex items-center gap-1 rounded-button border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-blue hover:text-brand-blue disabled:opacity-50"
                        >
                          {opening === row.id ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
                          View
                        </button>
                        {row.status === "pending_review" && (
                          <>
                            <Button
                              variant="success"
                              size="sm"
                              disabled={acting === row.id}
                              onClick={() => review(row.id, "verified")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={acting === row.id}
                              onClick={() => review(row.id, "rejected")}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
