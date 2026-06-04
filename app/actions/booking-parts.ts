"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mechanic-facing actions for the parts on one of their jobs (Task 10 Stage 2).
//
// Writes go through the service-role client after verifying the caller is the
// assigned mechanic (booking_parts has no mechanic UPDATE policy — same
// privileged-write pattern as the job lifecycle actions).
//
// Money model (owner decision, kept): platform commission is on the whole total
// and never changes here. Sourcing only moves the PARTS money:
//   - 'self' (default): the mechanic sources & keeps the part → payout includes
//     it (payout = total − fee, the snapshot from booking creation).
//   - 'bmt': the platform sources the part and keeps that money (+ supplier
//     margin) → payout for this booking is reduced by the BMT-sourced lines.
// So on every change we recompute mechanic_payout_pence = total − fee − Σ(bmt).

export type BookingPartResult = { ok: true } | { ok: false; error: string };

type Sourcing = "self" | "bmt";

async function assertAssignedMechanic(
  bookingPartId: string,
): Promise<
  | { ok: true; bookingId: string; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Read the line's booking via RLS (mechanic can read assigned booking parts).
  const { data: line } = await supabase
    .from("booking_parts")
    .select("id, booking_id, booking:bookings(mechanic_id)")
    .eq("id", bookingPartId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Part not found." };

  const booking = Array.isArray(line.booking) ? line.booking[0] : line.booking;
  if (!booking || booking.mechanic_id !== user.id) {
    return { ok: false, error: "You're not assigned to this job." };
  }
  return { ok: true, bookingId: line.booking_id, userId: user.id };
}

/** Recompute and persist the booking's mechanic payout from its parts sourcing. */
async function recomputePayout(bookingId: string): Promise<void> {
  const admin = createAdminClient();
  const [{ data: booking }, { data: parts }] = await Promise.all([
    admin
      .from("bookings")
      .select("total_pence, platform_fee_pence")
      .eq("id", bookingId)
      .single(),
    admin.from("booking_parts").select("total_pence, sourcing").eq("booking_id", bookingId),
  ]);
  if (!booking) return;

  const total = booking.total_pence ?? 0;
  const fee = booking.platform_fee_pence ?? 0;
  const bmtParts = (parts ?? [])
    .filter((p) => p.sourcing === "bmt")
    .reduce((s, p) => s + (p.total_pence ?? 0), 0);

  const payout = Math.max(0, total - fee - bmtParts);
  await admin.from("bookings").update({ mechanic_payout_pence: payout }).eq("id", bookingId);
}

export async function setPartSourcing(
  bookingPartId: string,
  sourcing: Sourcing,
): Promise<BookingPartResult> {
  if (sourcing !== "self" && sourcing !== "bmt") {
    return { ok: false, error: "Invalid sourcing option." };
  }
  const guard = await assertAssignedMechanic(bookingPartId);
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  // Ordering via BMT moves the line into the ordering workflow; self-sourcing
  // resets it to pending (the mechanic handles it themselves).
  const { error } = await admin
    .from("booking_parts")
    .update({
      sourcing,
      status: sourcing === "bmt" ? "ordered" : "pending",
      ordered_at: sourcing === "bmt" ? new Date().toISOString() : null,
    })
    .eq("id", bookingPartId);
  if (error) return { ok: false, error: error.message };

  await recomputePayout(guard.bookingId);
  revalidatePath(`/mechanic/jobs/${guard.bookingId}`);
  return { ok: true };
}

export async function markPartStatus(
  bookingPartId: string,
  status: "ordered" | "delivered" | "used",
): Promise<BookingPartResult> {
  const guard = await assertAssignedMechanic(bookingPartId);
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "ordered") patch.ordered_at = new Date().toISOString();
  if (status === "delivered") patch.delivered_at = new Date().toISOString();

  const { error } = await admin.from("booking_parts").update(patch).eq("id", bookingPartId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/mechanic/jobs/${guard.bookingId}`);
  return { ok: true };
}
