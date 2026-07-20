import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodePostcode, haversineMiles, outwardCode } from "@/lib/geo/postcodes";

// Broadcast dispatch (Task 05 Stage 2). Offers a booking to EVERY eligible
// online mechanic at once — first to accept wins (see app/actions/job-offers.ts).
//
// Eligibility for a mechanic:
//   1. status = 'online' and approved (approved_at is set)
//   2. the job address falls inside their service radius. We geocode both
//      postcodes via postcodes.io and compare straight-line distance against
//      service_radius_miles. If either postcode can't be geocoded we fall back
//      to a coarse same-outward-code (district) match.
//
// There is no specialism filter: every booking is a granular HaynesPro repair
// (Task 17), which maps to no catalogue specialism — jobs broadcast to every
// mechanic in range. mechanics.specialisms remains as vetting/profile info.
//
// Writes use the service-role client: the caller is usually a guest customer
// with no session, and we're inserting offer rows for many other users.

interface MechanicRow {
  id: string;
  base_postcode: string | null;
  service_radius_miles: number | null;
  is_suspended: boolean | null;
  suspended_until: string | null;
}

export interface DispatchResult {
  offered: number;
  /** True when we couldn't geocode the job and fell back to district matching. */
  usedFallback: boolean;
}

export async function dispatchBooking(bookingId: string): Promise<DispatchResult> {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, postcode, area, status, mechanic_id, preferred_mechanic_id")
    .eq("id", bookingId)
    .single();

  // Only dispatch a fresh, unassigned booking.
  if (!booking || booking.mechanic_id || booking.status !== "sourcing_mechanic") {
    return { offered: 0, usedFallback: false };
  }

  const { data: mechanics } = await admin
    .from("mechanics")
    .select("id, base_postcode, service_radius_miles, is_suspended, suspended_until")
    .eq("status", "online")
    .not("approved_at", "is", null);

  if (!mechanics?.length) return { offered: 0, usedFallback: false };

  const now = Date.now();

  const jobCoords = await geocodePostcode(booking.postcode);
  const jobArea = booking.area ?? outwardCode(booking.postcode ?? "");
  let usedFallback = !jobCoords;

  const eligible: string[] = [];
  for (const m of mechanics as MechanicRow[]) {
    // Suspended mechanics never get offers. An expired time-boxed suspension
    // auto-lifts (the daily cron clears the flag; here we just stop excluding).
    if (m.is_suspended && (!m.suspended_until || new Date(m.suspended_until).getTime() > now)) {
      continue;
    }
    if (!m.base_postcode) continue;

    const radius = m.service_radius_miles ?? 10;
    let inRange = false;

    if (jobCoords) {
      const mc = await geocodePostcode(m.base_postcode);
      if (mc) {
        inRange = haversineMiles(jobCoords, mc) <= radius;
      } else {
        usedFallback = true;
        inRange = outwardCode(m.base_postcode) === jobArea;
      }
    } else {
      inRange = outwardCode(m.base_postcode) === jobArea;
    }

    if (inRange) eligible.push(m.id);
  }

  if (!eligible.length) return { offered: 0, usedFallback };

  // Same-mechanic rebooking (Task 11 Stage 1): when the customer asked for their
  // previous mechanic and that mechanic is currently eligible + online, offer
  // the job to them ALONE — first refusal. If they don't accept, the existing
  // 5-minute dispatch-stall escalation surfaces it to the admin (we deliberately
  // don't auto-rebroadcast in this task). When the preferred mechanic isn't
  // available right now, fall through to the normal broadcast.
  const preferredId = (booking as { preferred_mechanic_id: string | null }).preferred_mechanic_id;
  let recipients = eligible;
  if (preferredId && eligible.includes(preferredId)) {
    recipients = [preferredId];
    await admin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "note",
      actor_role: "system",
      reason: "Offered exclusively to the customer's preferred mechanic (rebook).",
      payload: { kind: "preferred_exclusive_offer", mechanic_id: preferredId },
    });
  }

  // Upsert so a re-dispatch (or a race) can't create duplicate offers — the
  // unique (booking_id, mechanic_id) constraint backs this.
  const rows = recipients.map((mechanic_id) => ({
    booking_id: bookingId,
    mechanic_id,
  }));
  await admin
    .from("job_offers")
    .upsert(rows, { onConflict: "booking_id,mechanic_id", ignoreDuplicates: true });

  return { offered: recipients.length, usedFallback };
}

/**
 * Re-broadcast every still-unassigned booking. Called when a mechanic comes
 * online (manual toggle or auto-online after connecting their bank) so a job
 * booked while nobody was available isn't stranded — dispatchBooking is
 * idempotent (offer rows upsert on the unique booking/mechanic pair), so
 * re-offering to mechanics who already have the offer is a no-op. Returns the
 * number of bookings that reached at least one mechanic.
 */
export async function redispatchPending(): Promise<number> {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "sourcing_mechanic")
    .is("mechanic_id", null);

  if (!pending?.length) return 0;

  let reached = 0;
  for (const b of pending) {
    const { offered } = await dispatchBooking(b.id);
    if (offered > 0) reached += 1;
  }
  return reached;
}
