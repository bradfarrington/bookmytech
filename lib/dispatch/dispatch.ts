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
//      service_radius_miles. A bare district ("NG12") geocodes to its centroid
//      (lib/geo/postcodes.ts), so admin-set outward-only bases work too. Only
//      if a postcode can't be geocoded at all (API down, nonsense input) do we
//      fall back to a coarse same-outward-code (district) match — which is
//      strict by nature: NG10 ≠ NG12 even though they're 9 miles apart.
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

// One "nobody matched" note per booking. dispatchBooking re-runs every time a
// mechanic comes online (redispatchPending), so without the check a stranded
// booking would collect a duplicate note per toggle.
async function noteNoMatch(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  reason: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("booking_events")
    .select("id, payload")
    .eq("booking_id", bookingId)
    .eq("event_type", "note")
    .limit(50);
  const already = (existing ?? []).some(
    (e) => (e.payload as { kind?: string } | null)?.kind === "dispatch_no_match",
  );
  if (already) return;
  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "note",
    actor_role: "system",
    reason,
    payload: { kind: "dispatch_no_match" },
  });
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
  // Derive the district ourselves rather than trusting bookings.area: the SQL
  // trigger splits on a space, so a postcode typed without one ("NG127GG")
  // lands in `area` whole and could never equal a mechanic's district.
  const jobArea = outwardCode(booking.postcode ?? "") || booking.area || "";
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

  if (!eligible.length) {
    // Leave the admin a reason on the timeline. Before this, a booking that
    // matched nobody sat silent until the 5-minute stall sweep, with no clue
    // whether the postcode was bad or nobody was in range (Gareth's NG12 test).
    await noteNoMatch(
      admin,
      bookingId,
      jobCoords
        ? `No online mechanic has ${booking.postcode} inside their service radius (${mechanics.length} online checked).`
        : `Couldn't place postcode "${booking.postcode}" on the map — it may be mistyped. Only mechanics based in district ${jobArea || "?"} could be matched, and none were online.`,
    );
    return { offered: 0, usedFallback };
  }

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
