import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DISPUTE_STATUS_LABELS,
  ESCALATION_HOURS,
  MECHANIC_REASONS,
  REASON_LABELS,
  RESOLUTION_LABELS,
  mechanicPayoutLine,
  type DisputeStatus,
  type ResolutionKind,
} from "@/lib/disputes/constants";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";
import { formatJobNumber, shortPersonName } from "@/lib/utils";

// A dispute as the MECHANIC app's screen needs it
// (GET /api/mobile/v1/mechanic/disputes/[id], Task 69). The app can read the
// `disputes` row and its thread under RLS; what it can't get cleanly is the
// job's number and service, the customer's name cut down to "Marcus B", the
// labels, when Book My Tech steps in, and what it is allowed to do.
//
// `can` has exactly three entries, and that is the whole of a mechanic's power
// over a dispute: talk, ask Book My Tech to step in, and take back an issue
// they raised themselves. ONLY BOOK MY TECH DECIDES ONE (owner decision
// 2026-09-17) — there is no accept, agree, offer or settle, here or anywhere.

export interface MechanicDisputeView {
  id: string;
  bookingId: string;
  jobNumber: string;
  service: string;
  status: DisputeStatus;
  statusLabel: string;
  openedByRole: "customer" | "mechanic";
  isOpener: boolean;
  customerName: string;
  reasonLabel: string;
  description: string;
  photos: string[];
  refundRequestedPence: number | null;
  /** When it passes to Book My Tech by itself. Null once escalated or closed. */
  escalatesAt: string | null;
  resolutionLabel: string | null;
  resolutionNote: string | null;
  resolutionRefundPence: number | null;
  /** Once resolved: what it means for their money, as their email put it. */
  payoutLine: string | null;
  can: { reply: boolean; escalate: boolean; withdraw: boolean };
  /** The reasons a mechanic may raise an issue under — for the "raise" form. */
  mechanicReasons: Array<{ value: string; label: string }>;
}

/** The instant the escalation cron will act on a dispute, or null when it won't. */
export function escalatesAt(d: { status: string; created_at: string; responded_at: string | null }): string | null {
  const from = d.status === "opened" ? d.created_at : d.status === "responded" ? (d.responded_at ?? d.created_at) : null;
  return from ? new Date(new Date(from).getTime() + ESCALATION_HOURS * 60 * 60 * 1000).toISOString() : null;
}

export async function mechanicDisputeViewFor(
  mechanicId: string,
  disputeId: string,
): Promise<({ ok: true } & MechanicDisputeView) | MechanicRefusal> {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("disputes")
    .select(
      `id, booking_id, opened_by, opened_by_role, reason_category, description, photos,
       refund_requested_pence, status, created_at, responded_at, resolution, resolution_note,
       resolution_refund_pence`,
    )
    .eq("id", disputeId)
    .maybeSingle();
  if (!d) return refuse("not_found", "That dispute no longer exists.");

  const { data: b } = await admin
    .from("bookings")
    .select("id, job_number, mechanic_id, customer_name, repair_description")
    .eq("id", d.booking_id)
    .maybeSingle();
  if (!b || b.mechanic_id !== mechanicId) return refuse("forbidden", "You're not a party to this dispute.");

  const status = d.status as DisputeStatus;
  const open = status !== "resolved" && status !== "withdrawn";
  const isOpener = d.opened_by === mechanicId;
  const resolution = (d.resolution as ResolutionKind | null) ?? null;

  return {
    ok: true,
    id: d.id,
    bookingId: d.booking_id,
    jobNumber: formatJobNumber(b.job_number),
    service: b.repair_description ?? "Vehicle repair",
    status,
    statusLabel: DISPUTE_STATUS_LABELS[status] ?? status,
    openedByRole: d.opened_by_role as "customer" | "mechanic",
    isOpener,
    customerName: shortPersonName(b.customer_name, "The customer"),
    reasonLabel: REASON_LABELS[d.reason_category] ?? d.reason_category,
    description: d.description,
    photos: d.photos ?? [],
    refundRequestedPence: d.refund_requested_pence,
    escalatesAt: escalatesAt(d),
    resolutionLabel: resolution ? (RESOLUTION_LABELS[resolution] ?? resolution) : null,
    resolutionNote: d.resolution_note,
    resolutionRefundPence: d.resolution_refund_pence,
    payoutLine: status === "resolved" ? mechanicPayoutLine(d.resolution_refund_pence ?? 0) : null,
    can: {
      reply: open,
      escalate: status === "opened" || status === "responded",
      withdraw: open && isOpener,
    },
    mechanicReasons: MECHANIC_REASONS.map((r) => ({ value: r.value, label: r.label })),
  };
}
