import Link from "next/link";
import { LifeBuoy, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/resolutions/status-pill";
import { bookingShortRef, type ResolutionStatus } from "@/lib/resolutions/constants";

export const dynamic = "force-dynamic";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

interface CaseRow {
  id: string;
  booking_id: string;
  status: ResolutionStatus;
  reason_label: string;
  redistributed: boolean;
  created_at: string;
  mechanic: { full_name: string | null } | { full_name: string | null }[] | null;
}

export default async function AdminResolutionsPage() {
  const supabase = await createClient();

  // Admin RLS (is_admin) returns every case. Disambiguate the profiles embed by
  // FK since the table has several profile references.
  const { data } = await supabase
    .from("resolution_cases")
    .select(
      "id, booking_id, status, reason_label, redistributed, created_at, mechanic:profiles!resolution_cases_mechanic_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });

  const cases = (data as CaseRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Resolution Center</h1>
          <p className="mt-1 text-sm text-text-muted">
            Internal cases raised by mechanics (or admins) about specific jobs. Never visible to
            customers.
          </p>
        </div>
        <Link
          href="/admin/resolutions/reasons"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-button border border-border bg-surface-card px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface"
        >
          <Settings size={15} />
          Reasons
        </Link>
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-card p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
            <LifeBuoy size={26} className="text-brand-blue" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">No cases yet</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            When a mechanic raises an issue about a job, it&apos;ll appear here for you to action.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Mechanic</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Raised</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/resolutions/${c.id}`}
                      className="font-semibold text-brand-blue hover:underline"
                    >
                      #{bookingShortRef(c.booking_id)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {one(c.mechanic)?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {c.reason_label}
                    {c.redistributed && (
                      <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-blue">
                        Redistributed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(c.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
