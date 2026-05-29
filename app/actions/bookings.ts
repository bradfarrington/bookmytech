"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
