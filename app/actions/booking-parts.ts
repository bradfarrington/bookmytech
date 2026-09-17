"use server";

import { createClient } from "@/lib/supabase/server";
import { markPartStatusFor, setPartSourcingFor } from "@/lib/mechanics/part-sourcing";

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

/** The signed-in user's id, or null. Whether they hold the job is the core's question. */
async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// The checks, the writes and the payout recompute live in
// lib/mechanics/part-sourcing.ts, shared with the mechanic app (Tasks 67, 68).

export async function setPartSourcing(
  bookingPartId: string,
  sourcing: Sourcing,
): Promise<BookingPartResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Not signed in." };
  const result = await setPartSourcingFor(userId, bookingPartId, sourcing);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function markPartStatus(
  bookingPartId: string,
  status: "ordered" | "delivered" | "used",
): Promise<BookingPartResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Not signed in." };
  const result = await markPartStatusFor(userId, bookingPartId, status);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
