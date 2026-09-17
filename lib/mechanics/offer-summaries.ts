import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mechanicSharePence } from "@/lib/earnings";
import { geocodePostcode, haversineMiles, outwardCode } from "@/lib/geo/postcodes";
import { repairLinesFor, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import { ALL_DAY_SLOT, formatBookingWhen } from "@/lib/slots";

// What a mechanic may know about a job BEFORE accepting it — the mechanic app's
// offer cards (GET /api/mobile/v1/mechanic/offers).
//
// RLS would let the app read the offered `bookings` row itself ("Mechanics can
// view offered bookings", 0008), but RLS is row-level: that read carries the
// customer's name, phone, email and street address to every mechanic the job
// was broadcast to. This is the narrow version — built here on the service
// role, scoped to `mechanicId`, and naming only what the decision needs. The
// location is the postcode DISTRICT ("NG12") and a distance, never the
// postcode. Everything else arrives once they have accepted and the assigned-
// booking policy applies.
//
// The same figures the website's offer screen shows
// (app/(mechanic)/mechanic/offer/[id]/page.tsx), from the same helpers.

export interface OfferSummary {
  offerId: string;
  bookingId: string;
  offeredAt: string;
  vehicle: { reg: string | null; make: string | null; model: string | null };
  /** One line for the whole booking; `repairs` has each job of a multi-job one. */
  repairDescription: string;
  repairs: Array<{ description: string; hours: number | null }>;
  /** Postcode district, e.g. "NG12". */
  area: string | null;
  /** Straight line from the mechanic's base. Null when either end won't geocode. */
  distanceMiles: number | null;
  /** "Wed 3 Sep · 8am–10am", or "Any of … · All day" for a flexible booking. */
  when: string;
  scheduledAt: string | null;
  slotWindow: string | null;
  /** The days a flexible booking offers ("YYYY-MM-DD"); null otherwise. */
  candidateDays: string[] | null;
  /** Accepting this leads straight to picking a 2-hour arrival window. */
  needsArrivalWindow: boolean;
  /** The mechanic's take-home, after commission. */
  payoutPence: number;
  specialInstructions: string | null;
}

interface OfferedBooking {
  id: string;
  vehicle_reg: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  area: string | null;
  postcode: string | null;
  scheduled_at: string | null;
  slot_window: string | null;
  candidate_days: string[] | null;
  total_pence: number | null;
  commission_rate: number | null;
  special_instructions: string | null;
  repair_node_id: string | null;
  repair_description: string | null;
  vehicle_raw_duration_hours: number | string | null;
}

const BOOKING_COLUMNS =
  "id, vehicle_reg, vehicle_make, vehicle_model, area, postcode, scheduled_at, slot_window, candidate_days, total_pence, commission_rate, special_instructions, repair_node_id, repair_description, vehicle_raw_duration_hours";

/** The mechanic's LIVE offers, newest first. Pass `offerId` for just one. */
export async function liveOfferSummariesFor(
  mechanicId: string,
  offerId?: string,
): Promise<OfferSummary[]> {
  const admin = createAdminClient();

  let query = admin
    .from("job_offers")
    .select(`id, offered_at, booking:bookings(${BOOKING_COLUMNS})`)
    .eq("mechanic_id", mechanicId)
    .is("response", null)
    .order("offered_at", { ascending: false })
    .limit(50);
  if (offerId) query = query.eq("id", offerId);
  const { data: rows, error } = await query;
  if (error) throw error;

  const offers = (rows ?? [])
    .map((row) => {
      const b = row.booking as unknown as OfferedBooking | OfferedBooking[] | null;
      const booking = Array.isArray(b) ? (b[0] ?? null) : b;
      return booking ? { id: row.id as string, offeredAt: row.offered_at as string, booking } : null;
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);
  if (offers.length === 0) return [];

  const [{ data: mechanic }, { data: lineRows }] = await Promise.all([
    admin.from("mechanics").select("base_postcode").eq("id", mechanicId).maybeSingle(),
    admin
      .from("booking_repairs")
      .select("*")
      .in("booking_id", offers.map((o) => o.booking.id))
      .order("position"),
  ]);
  const base = mechanic?.base_postcode ? await geocodePostcode(mechanic.base_postcode) : null;

  const linesByBooking = new Map<string, BookingRepairRow[]>();
  for (const line of (lineRows ?? []) as Array<BookingRepairRow & { booking_id: string }>) {
    const list = linesByBooking.get(line.booking_id) ?? [];
    list.push(line);
    linesByBooking.set(line.booking_id, list);
  }

  return Promise.all(
    offers.map(async ({ id, offeredAt, booking }) => {
      const job = base && booking.postcode ? await geocodePostcode(booking.postcode) : null;
      const lines = repairLinesFor(booking, linesByBooking.get(booking.id) ?? null);
      return {
        offerId: id,
        bookingId: booking.id,
        offeredAt,
        vehicle: { reg: booking.vehicle_reg, make: booking.vehicle_make, model: booking.vehicle_model },
        repairDescription: booking.repair_description ?? "Vehicle repair",
        repairs: lines.map((l) => ({ description: l.description, hours: l.chargedHours ?? l.rawHours })),
        area: outwardCode(booking.postcode ?? "") || booking.area || null,
        distanceMiles: base && job ? Math.round(haversineMiles(base, job) * 10) / 10 : null,
        when: formatBookingWhen(booking),
        scheduledAt: booking.scheduled_at,
        slotWindow: booking.slot_window,
        candidateDays: booking.candidate_days?.length ? [...booking.candidate_days].sort() : null,
        needsArrivalWindow: booking.slot_window === ALL_DAY_SLOT.window,
        payoutPence: mechanicSharePence(booking.total_pence ?? 0, booking.commission_rate ?? 0.15),
        specialInstructions: booking.special_instructions?.trim() || null,
      };
    }),
  );
}
