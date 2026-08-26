import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardHeader } from "../_components/dashboard-header";
import {
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  REASON_LABELS,
  type DisputeStatus,
} from "@/lib/disputes/constants";
import { formatJobNumber, formatPrice } from "@/lib/utils";

// Every dispute this customer has raised, open and closed.
//
// The dashboard surfaces OPEN disputes only, because those are the ones waiting
// on somebody. This is the full history, and the reason it exists at all: until
// now a resolved case was unreachable once its job scrolled out of Past jobs —
// there was no page listing them and no link to one.

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["opened", "responded", "escalated"];

export default async function CustomerDisputesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: profile }, { data: rows }] = await Promise.all([
    admin.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    // Service-role, scoped to this user's own bookings — same pattern as the
    // dashboard, which needs joins the customer's own RLS grant can't see.
    admin
      .from("disputes")
      .select(
        `id, status, reason_category, created_at, resolved_at, refund_requested_pence,
         resolution_refund_pence,
         booking:bookings!inner(job_number, repair_description, customer_id, customer_email)`,
      )
      .order("created_at", { ascending: false }),
  ]);

  const email = (user.email ?? "").toLowerCase();

  // One flat, typed shape for the list — PostgREST returns the embedded booking
  // as either an object or a single-element array depending on how it infers the
  // relationship, so normalise it once here instead of at every use.
  type DisputeRow = {
    id: string;
    status: DisputeStatus;
    reasonCategory: string;
    createdAt: string;
    refundedPence: number | null;
    jobNumber: number | null;
    repairDescription: string;
  };

  const mine: DisputeRow[] = [];
  for (const d of rows ?? []) {
    const b = (Array.isArray(d.booking) ? d.booking[0] : d.booking) as
      | { job_number: number | null; repair_description: string | null; customer_id: string | null; customer_email: string | null }
      | undefined;
    if (!b) continue;

    // Ownership is filtered here rather than in the query: an `or` across an
    // embedded table isn't expressible as one PostgREST filter. The rule mirrors
    // the "Customers can view own bookings" policy — an id match, or a guest
    // booking on this email.
    const owns =
      b.customer_id === user.id ||
      (b.customer_id == null && !!b.customer_email && b.customer_email.toLowerCase() === email);
    if (!owns) continue;

    mine.push({
      id: d.id,
      status: d.status as DisputeStatus,
      reasonCategory: d.reason_category,
      createdAt: d.created_at,
      refundedPence: d.resolution_refund_pence ?? null,
      jobNumber: b.job_number,
      repairDescription: b.repair_description ?? "Vehicle repair",
    });
  }

  const open = mine.filter((d) => OPEN_STATUSES.includes(d.status));
  const closed = mine.filter((d) => !OPEN_STATUSES.includes(d.status));

  return (
    <div className="min-h-dvh bg-surface">
      <DashboardHeader
        name={profile?.full_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
      />

      <main className="mx-auto w-full max-w-content px-4 py-8 sm:px-6">
        <div className="flex max-w-3xl flex-col gap-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} />
          Back to dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-text-primary">Your disputes</h1>
          <p className="mt-1 text-text-secondary">
            Cases you&apos;ve raised about a job, and how each one was settled.
          </p>
        </div>

        {mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-card p-10 text-center">
            <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface text-text-muted">
              <Scale size={22} />
            </span>
            <p className="font-semibold text-text-primary">No disputes</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
              If something isn&apos;t right with a job, you can raise a dispute from
              that booking for 48 hours after it&apos;s completed.
            </p>
            <Link
              href="/dashboard"
              className="mt-5 inline-flex h-10 items-center rounded-button border border-border px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Back to your bookings
            </Link>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <DisputeGroup heading="Open" rows={open} />
            )}
            {closed.length > 0 && (
              <DisputeGroup heading="Closed" rows={closed} />
            )}
          </>
        )}
        </div>
      </main>
    </div>
  );
}

type DisputeRowView = {
  id: string;
  status: DisputeStatus;
  reasonCategory: string;
  createdAt: string;
  refundedPence: number | null;
  jobNumber: number | null;
  repairDescription: string;
};

function DisputeGroup({ heading, rows }: { heading: string; rows: DisputeRowView[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-muted">
        {heading}
      </h2>
      <div className="flex flex-col gap-3">
        {rows.map((d) => (
          <Link
            key={d.id}
            href={`/dashboard/disputes/${d.id}`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface-card p-4 transition-colors hover:border-brand-blue"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-text-primary">
                {d.repairDescription}
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {REASON_LABELS[d.reasonCategory] ?? d.reasonCategory}
                {d.jobNumber != null && <> · Job {formatJobNumber(d.jobNumber)}</>}
                {" · "}
                Raised{" "}
                {new Date(d.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              {d.refundedPence != null && d.refundedPence > 0 && (
                <p className="mt-0.5 text-sm font-medium text-success">
                  {formatPrice(d.refundedPence)} refunded
                </p>
              )}
            </div>

            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                DISPUTE_STATUS_TONES[d.status] ?? "bg-surface text-text-secondary"
              }`}
            >
              {DISPUTE_STATUS_LABELS[d.status] ?? d.status}
            </span>
            <ArrowRight size={16} className="shrink-0 text-text-muted" />
          </Link>
        ))}
      </div>
    </section>
  );
}
