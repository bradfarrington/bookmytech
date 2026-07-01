import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface LogRow {
  id: string;
  recipient_phone: string;
  message_body: string | null;
  status: string;
  credits_used: number;
  created_at: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
];

export default async function SmsLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status === "sent" || status === "failed" ? status : "all";

  const admin = createAdminClient();
  let query = admin
    .from("sms_log")
    .select("id, recipient_phone, message_body, status, credits_used, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") query = query.eq("status", filter);
  const { data: logs } = await query;
  const rows = (logs ?? []) as LogRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text-primary">Sent messages</h2>
          <p className="text-sm text-text-muted">Most recent 200 outbound texts.</p>
        </div>
        <div className="flex gap-1 rounded-button border border-border p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/sms/logs" : `/admin/sms/logs?status=${f.key}`}
              className={cn(
                "rounded-[6px] px-3 py-1 text-xs font-semibold transition",
                filter === f.key
                  ? "bg-brand-blue text-white"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-text-muted">No messages yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">To</th>
                <th className="px-5 py-3">Message</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Credits</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle align-top last:border-b-0">
                  <td className="whitespace-nowrap px-5 py-3 text-text-secondary">
                    {new Date(r.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-text-primary">
                    {r.recipient_phone}
                  </td>
                  <td className="max-w-md px-5 py-3 text-text-secondary">{r.message_body ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                        r.status === "sent"
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger",
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-text-secondary">{r.credits_used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
