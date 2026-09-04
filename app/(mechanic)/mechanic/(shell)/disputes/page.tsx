import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn, formatJobNumber, formatPrice } from "@/lib/utils";
import { Overline } from "@/components/ui/overline";
import { Card } from "@/components/ui/card";
import {
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  RESOLUTION_LABELS,
} from "@/lib/disputes/constants";
import {
  groupMechanicDisputes,
  listMechanicDisputes,
  type MechanicDisputeRow,
} from "@/lib/disputes/list";

// The mechanic's disputes (Task 25): every dispute on one of their jobs, open
// ones first. Until now the only way in was the "View dispute" button on a
// job page — a mechanic with a customer complaint had no list to find it in.
// The detail page and the raise page already existed; this is the index.
//
// No "Raise a dispute" button up here: a dispute belongs to a job, and the job
// page has the button. Disputes are the customer-facing complaint system;
// "Get help" (the Resolution Center) is the separate mechanic ↔ BMT one.

export const dynamic = "force-dynamic";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return "just now";
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function MechanicDisputesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to disputes the mechanic is a party to; the loader's
  // inner join keeps it to disputes on THEIR jobs.
  const rows = await listMechanicDisputes(supabase, user.id);
  const { open, closed } = groupMechanicDisputes(rows);
  const escalated = open.filter((d) => d.status === "escalated").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Overline>Disputes</Overline>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">Disputes</h1>
        <p className="mt-1 text-sm text-text-muted">
          {rows.length === 0
            ? "Issues raised on your jobs, by you or the customer."
            : `${open.length} open${escalated ? ` · ${escalated} with Book My Tech` : ""} · ${closed.length} closed`}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
            <Scale size={26} className="text-brand-blue" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">No disputes</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            If a customer raises an issue with one of your jobs it appears here. You can
            raise one yourself from the job page.
          </p>
        </Card>
      ) : (
        <>
          <Section title="Open" rows={open} emptyText="Nothing open right now." />
          {closed.length > 0 && <Section title="Closed" rows={closed} />}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: MechanicDisputeRow[];
  emptyText?: string;
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                href={`/mechanic/disputes/${d.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-card p-4 transition-colors hover:border-brand-blue/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {d.repairDescription}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    Job #{formatJobNumber(d.jobNumber)}
                    {d.customerName ? ` · ${d.customerName}` : ""}
                    {d.vehicleReg ? ` · ${d.vehicleReg}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {d.reasonLabel} · raised by {d.openedByRole === "mechanic" ? "you" : "the customer"}{" "}
                    {ago(d.createdAt)}
                    {d.resolution && ` · ${RESOLUTION_LABELS[d.resolution] ?? d.resolution}`}
                    {d.refundedPence != null && d.refundedPence > 0 && ` · ${formatPrice(d.refundedPence)} refunded`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      DISPUTE_STATUS_TONES[d.status],
                    )}
                  >
                    {DISPUTE_STATUS_LABELS[d.status] ?? d.status}
                  </span>
                  <ChevronRight size={16} className="text-text-muted" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
