import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatJobNumber } from "@/lib/utils";
import { DisputeThread } from "@/components/disputes/dispute-thread";
import { ArbitrationPanel } from "@/components/disputes/arbitration-panel";
import {
  REASON_LABELS,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  RESOLUTION_LABELS,
  type DisputeStatus,
  type ResolutionKind,
} from "@/lib/disputes/constants";

export const dynamic = "force-dynamic";

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: dispute } = await admin.from("disputes").select("*").eq("id", id).maybeSingle();
  if (!dispute) notFound();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, job_number, status, total_pence, credit_applied_pence, mechanic_payout_pence,
       customer_id, customer_name, customer_email, mechanic_id,
       vehicle_reg, vehicle_make, vehicle_model, created_at, completed_at,
       repair_description`,
    )
    .eq("id", dispute.booking_id)
    .single();
  if (!booking) notFound();

  // Customer + mechanic profiles, mechanic rating, customer history (for the rule).
  const [{ data: customer }, { data: mechProfile }, { data: mech }, { count: customerBookings }] =
    await Promise.all([
      booking.customer_id
        ? admin.from("profiles").select("full_name").eq("id", booking.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
      booking.mechanic_id
        ? admin.from("profiles").select("full_name").eq("id", booking.mechanic_id).maybeSingle()
        : Promise.resolve({ data: null }),
      booking.mechanic_id
        ? admin.from("mechanics").select("rating, job_count").eq("id", booking.mechanic_id).maybeSingle()
        : Promise.resolve({ data: null }),
      booking.customer_id
        ? admin.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", booking.customer_id)
        : Promise.resolve({ count: 0 }),
    ]);

  // Payment status from the audit trail.
  const { data: events } = await admin
    .from("booking_events")
    .select("event_type")
    .eq("booking_id", booking.id);
  const types = new Set((events ?? []).map((e) => e.event_type));

  const chargedPence = Math.max(0, (booking.total_pence ?? 0) - (booking.credit_applied_pence ?? 0));
  const closed = dispute.status === "resolved" || dispute.status === "withdrawn";

  // Suggested resolution (simple rule): strong mechanic + first-time customer →
  // lean customer benefit-of-doubt; otherwise neutral.
  const rating = mech?.rating ?? 0;
  const firstBooking = (customerBookings ?? 0) <= 1;
  const suggestion = closed
    ? null
    : rating >= 4.8 && firstBooking
      ? "Lean to the customer — a strong-rated mechanic vs a first-time customer; give benefit of the doubt."
      : "Neutral — weigh both accounts and the evidence on their merits.";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href="/admin/disputes" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
        <ArrowLeft size={15} />
        Disputes
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">Booking #{formatJobNumber(booking.job_number)}</p>
          <h1 className="text-2xl font-bold text-text-primary">{booking.repair_description ?? "Vehicle repair"}</h1>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DISPUTE_STATUS_TONES[dispute.status as DisputeStatus]}`}>
          {DISPUTE_STATUS_LABELS[dispute.status as DisputeStatus]}
        </span>
      </div>

      {/* Case file */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Customer" value={customer?.full_name ?? booking.customer_name ?? "—"} sub={`${customerBookings ?? 0} booking(s)`} />
        <Info label="Mechanic" value={mechProfile?.full_name ?? "—"} sub={mech ? `${rating.toFixed(1)}★ · ${mech.job_count ?? 0} jobs` : "—"} link={booking.mechanic_id ? `/admin/mechanics/${booking.mechanic_id}` : undefined} />
        <Info label="Vehicle" value={[booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" ") || "—"} sub={booking.vehicle_reg ?? ""} />
        <Info
          label="Payment"
          value={formatPrice(chargedPence)}
          sub={
            types.has("payment_refunded")
              ? "Refunded"
              : types.has("payout_reversed")
                ? "Captured · payout held"
                : types.has("payout_transferred")
                  ? "Captured · paid out"
                  : types.has("payment_captured")
                    ? "Captured"
                    : "Not captured"
          }
        />
      </div>

      {/* The opener's case */}
      <div className="rounded-2xl border border-border bg-surface-card p-5">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-text-muted">
          {REASON_LABELS[dispute.reason_category] ?? dispute.reason_category} · raised by the {dispute.opened_by_role}
        </p>
        <p className="whitespace-pre-wrap text-sm text-text-primary">{dispute.description}</p>
        {dispute.refund_requested_pence != null && (
          <p className="mt-2 text-sm font-medium text-text-secondary">Refund sought: {formatPrice(dispute.refund_requested_pence)}</p>
        )}
        {(dispute.photos ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(dispute.photos as string[]).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" className="size-20 rounded-lg border border-border object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Conversation — admin can post as the mediator */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">Conversation</h2>
        <DisputeThread disputeId={dispute.id} viewerRole="admin" closed={closed} />
      </div>

      {/* Decision or outcome */}
      {closed ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-bold text-green-900">
            {dispute.resolution ? RESOLUTION_LABELS[dispute.resolution as ResolutionKind] : "Resolved"}
          </p>
          {dispute.resolution_note && <p className="mt-1.5 text-sm text-green-900">{dispute.resolution_note}</p>}
          {(dispute.resolution_refund_pence ?? 0) > 0 && (
            <p className="mt-1 text-sm text-green-900">Refunded {formatPrice(dispute.resolution_refund_pence)}</p>
          )}
          {(dispute.resolution_credit_pence ?? 0) > 0 && (
            <p className="text-sm text-green-900">Credit {formatPrice(dispute.resolution_credit_pence)}</p>
          )}
        </div>
      ) : (
        <ArbitrationPanel disputeId={dispute.id} chargedPence={chargedPence} suggestion={suggestion} />
      )}
    </div>
  );
}

function Info({ label, value, sub, link }: { label: string; value: string; sub?: string; link?: string }) {
  const inner = (
    <div className="rounded-2xl border border-border bg-surface-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 font-semibold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
  return link ? (
    <Link href={link} className="transition-colors hover:[&>div]:border-brand-blue/40">
      {inner}
    </Link>
  ) : (
    inner
  );
}
