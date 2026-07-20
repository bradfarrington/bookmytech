import Link from "next/link";
import { Scale } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatJobNumber } from "@/lib/utils";
import {
  REASON_LABELS,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  type DisputeStatus,
} from "@/lib/disputes/constants";

export const dynamic = "force-dynamic";

// Priority for the queue: escalated cases need a decision first, then live
// cases, then closed ones — each oldest-first within its band.
const PRIORITY: Record<string, number> = {
  escalated: 0,
  responded: 1,
  opened: 2,
  resolved: 3,
  withdrawn: 4,
};

interface Row {
  id: string;
  status: string;
  opened_by_role: string;
  reason_category: string;
  created_at: string;
  booking: { id: string; job_number: number | null; repair_description: string | null } | { id: string; job_number: number | null; repair_description: string | null }[] | null;
}

function bookingOf(r: Row) {
  return Array.isArray(r.booking) ? r.booking[0] : r.booking;
}
function repairName(r: Row): string {
  return bookingOf(r)?.repair_description ?? "Vehicle repair";
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminDisputesPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("disputes")
    .select("id, status, opened_by_role, reason_category, created_at, booking:bookings(id, job_number, repair_description)")
    .order("created_at", { ascending: true });

  const rows = ((data as Row[]) ?? []).sort(
    (a, b) => (PRIORITY[a.status] ?? 9) - (PRIORITY[b.status] ?? 9),
  );
  const open = rows.filter((r) => ["opened", "responded", "escalated"].includes(r.status));
  const needsArbitration = rows.filter((r) => r.status === "escalated").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Disputes</h1>
        <p className="text-text-secondary">
          {open.length} open · {needsArbitration} awaiting your arbitration. You mediate — step in when the parties can&apos;t resolve it themselves.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-card p-10 text-center">
          <Scale size={28} className="mx-auto text-text-muted" />
          <p className="mt-2 font-semibold text-text-primary">No disputes</p>
          <p className="text-sm text-text-secondary">When a customer or mechanic raises one, it&apos;ll appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Ref</th>
                <th className="px-4 py-3 font-semibold">Repair</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold">Raised by</th>
                <th className="px-4 py-3 font-semibold">Age</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = bookingOf(r);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="px-4 py-3">
                      <Link href={`/admin/disputes/${r.id}`} className="font-semibold text-brand-blue hover:underline">
                        #{formatJobNumber(b?.job_number)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-primary">{repairName(r)}</td>
                    <td className="px-4 py-3 text-text-secondary">{REASON_LABELS[r.reason_category] ?? r.reason_category}</td>
                    <td className="px-4 py-3 capitalize text-text-secondary">{r.opened_by_role}</td>
                    <td className="px-4 py-3 text-text-muted">{ago(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DISPUTE_STATUS_TONES[r.status as DisputeStatus]}`}>
                        {DISPUTE_STATUS_LABELS[r.status as DisputeStatus]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
