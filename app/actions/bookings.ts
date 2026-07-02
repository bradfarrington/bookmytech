"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundPayment } from "@/lib/stripe/refund";
import { recordRefundClawback } from "@/lib/mechanics/balance";
import { formatPrice, formatJobNumber } from "@/lib/utils";

export type BookingActionResult = { ok: true } | { ok: false; error: string };

// Shared admin guard. All booking mutations run under the admin's session so
// RLS ("Admins can update all bookings" / "Admins can insert booking events")
// applies; we also return the actor for the audit row.
type Supa = Awaited<ReturnType<typeof createClient>>;
type AdminGuard =
  | { ok: false; error: string }
  | { ok: true; supabase: Supa; actorId: string };

async function requireAdmin(): Promise<AdminGuard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only." };
  return { ok: true, supabase, actorId: user.id };
}

function revalidate(id: string) {
  revalidatePath(`/admin/jobs/${id}`);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
}

export async function cancelBooking(
  id: string,
  reason: string,
): Promise<BookingActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A cancellation reason is required." };

  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const { supabase, actorId } = guard;

  const { data: booking } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", id)
    .single();
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status === "cancelled")
    return { ok: false, error: "This booking is already cancelled." };

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Append-only audit. Stripe auto-releases the manual-capture authorisation
  // after 7 days; capture/refund + fees land in Task 12.
  await supabase.from("booking_events").insert({
    booking_id: id,
    event_type: "cancelled",
    actor_id: actorId,
    actor_role: "admin",
    reason: trimmed,
    payload: { status_from: booking.status, status_to: "cancelled" },
  });

  revalidate(id);
  return { ok: true };
}

export async function markDisputed(
  id: string,
  reason: string,
): Promise<BookingActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A reason is required to flag a dispute." };

  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const { supabase, actorId } = guard;

  const { data: booking } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", id)
    .single();
  if (!booking) return { ok: false, error: "Booking not found." };

  const { error } = await supabase
    .from("bookings")
    .update({ status: "disputed" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("booking_events").insert({
    booking_id: id,
    event_type: "disputed",
    actor_id: actorId,
    actor_role: "admin",
    reason: trimmed,
    payload: { status_from: booking.status, status_to: "disputed" },
  });

  revalidate(id);
  return { ok: true };
}

/**
 * Refund a customer (in whole or part) on a captured booking, and recover the
 * value from the mechanic.
 *
 * Money model (owner decision 2026-07-01): BMT fronts the refund out of its own
 * Stripe balance (that's how a platform-charge refund works). The mechanic was
 * already paid instantly at completion, so we can't reverse that — instead the
 * full refunded amount is debited from their balance ledger, taking it NEGATIVE.
 * The debt is netted off their next job's payout (see completeAndCharge).
 *
 * Admin picks the amount; it's clamped to what's still refundable (charged minus
 * anything already refunded). Runs its money ops under the service-role client so
 * the ledger write (no browser INSERT policy) succeeds.
 */
export async function refundBooking(
  id: string,
  amountPence: number,
  reason: string,
): Promise<BookingActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const { actorId } = guard;

  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A refund reason is required." };
  const amount = Math.round(amountPence);
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "Enter a refund amount greater than zero." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, job_number, status, mechanic_id, total_pence, credit_applied_pence, stripe_payment_intent_id",
    )
    .eq("id", id)
    .single();
  if (!booking) return { ok: false, error: "Booking not found." };
  if (!booking.stripe_payment_intent_id)
    return { ok: false, error: "This booking has no captured payment to refund." };

  // Refundable = what the customer actually paid, minus anything already refunded.
  const chargedPence = Math.max(
    0,
    (booking.total_pence ?? 0) - (booking.credit_applied_pence ?? 0),
  );
  const { data: priorRefunds } = await admin
    .from("booking_events")
    .select("payload")
    .eq("booking_id", id)
    .eq("event_type", "payment_refunded");
  const alreadyRefunded = (priorRefunds ?? []).reduce(
    (sum, e) => sum + ((e.payload as { amount_pence?: number } | null)?.amount_pence ?? 0),
    0,
  );
  const refundable = chargedPence - alreadyRefunded;
  if (refundable <= 0)
    return { ok: false, error: "This booking has already been fully refunded." };
  if (amount > refundable)
    return {
      ok: false,
      error: `Only ${formatPrice(refundable)} is left to refund on this booking.`,
    };

  // 1) Refund the customer's card from BMT's Stripe balance.
  const r = await refundPayment(booking.stripe_payment_intent_id, amount);
  if (!r.ok) return { ok: false, error: `Refund failed: ${r.error}. Nothing was changed — try again.` };

  // 2) Audit the refund on the booking timeline.
  await admin.from("booking_events").insert({
    booking_id: id,
    event_type: "payment_refunded",
    actor_id: actorId,
    actor_role: "admin",
    reason: trimmed,
    payload: { amount_pence: amount, refund_id: r.refundId },
  });

  // 3) Recover it from the mechanic — their balance goes negative and is netted
  //    off their next payout. No mechanic (e.g. never assigned) → BMT absorbs it.
  if (booking.mechanic_id) {
    const bref = formatJobNumber(booking.job_number);
    await recordRefundClawback(
      admin,
      booking.mechanic_id,
      id,
      amount,
      r.refundId,
      actorId,
      `Refund on job ${bref}: ${trimmed}`,
    );
    revalidatePath(`/admin/mechanics/${booking.mechanic_id}`);
    revalidatePath("/mechanic/earnings");
  }

  revalidate(id);
  return { ok: true };
}

export async function reassignMechanic(
  id: string,
  mechanicId: string,
): Promise<BookingActionResult> {
  if (!mechanicId) return { ok: false, error: "Pick a mechanic to assign." };

  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const { supabase, actorId } = guard;

  const { data: booking } = await supabase
    .from("bookings")
    .select("status, mechanic_id")
    .eq("id", id)
    .single();
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.mechanic_id === mechanicId)
    return { ok: false, error: "That mechanic is already assigned." };

  // Confirm assignment if it was still sourcing; otherwise leave the lifecycle
  // status untouched.
  const statusTo =
    booking.status === "sourcing_mechanic" ? "confirmed" : booking.status;

  const { error } = await supabase
    .from("bookings")
    .update({ mechanic_id: mechanicId, status: statusTo })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("booking_events").insert({
    booking_id: id,
    event_type: booking.mechanic_id ? "mechanic_reassigned" : "mechanic_assigned",
    actor_id: actorId,
    actor_role: "admin",
    payload: {
      mechanic_id: mechanicId,
      previous_mechanic_id: booking.mechanic_id,
      status_from: booking.status,
      status_to: statusTo,
    },
  });

  revalidate(id);
  return { ok: true };
}
