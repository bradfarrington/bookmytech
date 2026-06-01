import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodePostcode, haversineMiles, outwardCode } from "@/lib/geo/postcodes";

// Broadcast dispatch (Task 05 Stage 2). Offers a booking to EVERY eligible
// online mechanic at once — first to accept wins (see app/actions/job-offers.ts).
//
// Eligibility for a mechanic:
//   1. status = 'online' and approved (approved_at is set)
//   2. specialism match — the booking's service slug is in mechanic.specialisms.
//      A mechanic who hasn't declared any specialisms is treated as a generalist
//      and stays eligible (so they still get offers before they set up).
//   3. the job address falls inside their service radius. We geocode both
//      postcodes via postcodes.io and compare straight-line distance against
//      service_radius_miles. If either postcode can't be geocoded we fall back
//      to a coarse same-outward-code (district) match.
//
// Writes use the service-role client: the caller is usually a guest customer
// with no session, and we're inserting offer rows for many other users.

interface MechanicRow {
  id: string;
  base_postcode: string | null;
  service_radius_miles: number | null;
  specialisms: string[] | null;
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
    .select(
      "id, postcode, area, status, mechanic_id, service:services(slug)",
    )
    .eq("id", bookingId)
    .single();

  // Only dispatch a fresh, unassigned booking.
  if (!booking || booking.mechanic_id || booking.status !== "sourcing_mechanic") {
    return { offered: 0, usedFallback: false };
  }

  // service is a to-one join; supabase-js may type it as an array.
  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  const slug: string | null = service?.slug ?? null;

  const { data: mechanics } = await admin
    .from("mechanics")
    .select("id, base_postcode, service_radius_miles, specialisms")
    .eq("status", "online")
    .not("approved_at", "is", null);

  if (!mechanics?.length) return { offered: 0, usedFallback: false };

  const jobCoords = await geocodePostcode(booking.postcode);
  const jobArea = booking.area ?? outwardCode(booking.postcode ?? "");
  let usedFallback = !jobCoords;

  const eligible: string[] = [];
  for (const m of mechanics as MechanicRow[]) {
    // Specialism filter — skip only when they have declared specialisms that
    // don't include this service.
    if (
      slug &&
      Array.isArray(m.specialisms) &&
      m.specialisms.length > 0 &&
      !m.specialisms.includes(slug)
    ) {
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

  // Upsert so a re-dispatch (or a race) can't create duplicate offers — the
  // unique (booking_id, mechanic_id) constraint backs this.
  const rows = eligible.map((mechanic_id) => ({
    booking_id: bookingId,
    mechanic_id,
  }));
  await admin
    .from("job_offers")
    .upsert(rows, { onConflict: "booking_id,mechanic_id", ignoreDuplicates: true });

  return { offered: eligible.length, usedFallback };
}
