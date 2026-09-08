import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The second half of every mechanic-side write: after `requireMechanic()` has
// proved the caller is a mechanic, re-read the booking under the service-role
// client and confirm THIS mechanic holds it. Mechanics have no UPDATE rights
// on `bookings` under RLS, so every action verifies ownership here and then
// mutates through the same admin client this returns.
//
// Extracted from job-media.ts (Task 30) so the mileage, checklist and quote
// actions share one check instead of four copies drifting apart.

export interface OwnedBooking {
  id: string;
  status: string;
  mechanic_id: string | null;
}

export type OwnedBookingResult =
  | { ok: true; booking: OwnedBooking; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; error: string };

export async function ownedBooking(bookingId: string, mechanicId: string): Promise<OwnedBookingResult> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id")
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false, error: "That job no longer exists." };
  if (booking.mechanic_id !== mechanicId) return { ok: false, error: "This isn't your job." };
  return { ok: true, booking, admin };
}
