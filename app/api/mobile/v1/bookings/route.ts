import { createBooking, type CreateBookingInput } from "@/lib/bookings/create-booking";
import { enforceBookingLimits, staffRefusal } from "@/lib/mobile/booking-guards";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { requireMobileUser } from "@/lib/supabase/mobile";
import { isUuid } from "@/lib/mobile/customer-actions";

// POST /api/mobile/v1/bookings — create the booking. AUTHENTICATED.
//
// Called only AFTER the hold from /checkout/prepare is confirmed on device.
//
// 200: { ok: true, bookingId } | { ok: false, error }
//      A booking we couldn't write (the repair stopped being priceable, the
//      insert failed) is a request that RAN with a negative answer. Only
//      transport-level problems return `{ error }` with a non-2xx: 401 (no or
//      expired token), 403 (staff account), 400/415 (bad body), 429.
//
// Thin wrapper over `createBooking` — the SAME function the website's checkout
// calls through app/actions/create-booking.ts. It re-quotes from (reg, node),
// snapshots the price breakdown, writes the row, redeems credit, dispatches to
// mechanics and sends the confirmation email and SMS. None of that is repeated
// here, or the two clients would drift on what a booking IS.
//
// WHAT WE REFUSE TO TAKE FROM THE BODY, and why:
//
//   • customerEmail — comes from the verified token. It is the key the guest-
//     match half of the "Customers can view own bookings" RLS policy compares
//     against (customer_id is null AND auth.email() = customer_email), so a
//     client-supplied email would let someone attach a booking to another
//     person's dashboard.
//   • customerPhone — `createBooking` reads it from the caller's profile.
//   • the customer id — from the token, never the request. Reaching for the
//     cookie client instead would resolve to null and silently write a GUEST
//     booking: the job would never appear in the customer's account, and credit
//     and preferred-mechanic handling would be skipped. See lib/supabase/mobile.ts.
//   • any price, duration or total — the server re-quotes. `creditAppliedPence`
//     is echoed back from prepare only as a CAP; the redeem clamps it to the
//     ledger balance, so inflating it here buys nothing.

type ParkingType = "driveway" | "street" | "car_park" | "other";

const PARKING_TYPES: readonly ParkingType[] = ["driveway", "street", "car_park", "other"];

interface BookingBody {
  vehicleReg?: unknown;
  vehicleMake?: unknown;
  vehicleModel?: unknown;
  repairNodeId?: unknown;
  scheduledAt?: unknown;
  slotWindow?: unknown;
  customerName?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  postcode?: unknown;
  parkingType?: unknown;
  specialInstructions?: unknown;
  stripePaymentIntentId?: unknown;
  paymentMode?: unknown;
  creditAppliedPence?: unknown;
  /** Rebook "same mechanic if available" — optional, a mechanic id. */
  preferredMechanicId?: unknown;
}

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<BookingBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await requireMobileUser(request);
  if (!auth.ok) return apiError(auth.error, auth.status);
  const caller = auth.caller;

  const refusal = staffRefusal(caller);
  if (refusal) return refusal;

  // The booking is written against the token's email, so we need one. A customer
  // account always has it; a session without one can't own a booking safely.
  if (!caller.email) {
    return apiError("We couldn't confirm your email address. Please sign in again.", 401);
  }

  const body = parsed.body;
  const vehicleReg = asString(body.vehicleReg).toUpperCase();
  const vehicleMake = asString(body.vehicleMake);
  const vehicleModel = asString(body.vehicleModel);
  const repairNodeId = asString(body.repairNodeId);
  const scheduledAt = asString(body.scheduledAt);
  const slotWindow = asString(body.slotWindow);
  const customerName = asString(body.customerName);
  const addressLine1 = asString(body.addressLine1);
  const addressLine2 = asString(body.addressLine2);
  const postcode = asString(body.postcode).toUpperCase();
  const parkingType = asString(body.parkingType);
  const specialInstructions = asString(body.specialInstructions);
  const paymentMode = asString(body.paymentMode);
  const stripePaymentIntentId = asString(body.stripePaymentIntentId);
  const preferredMechanicId = asString(body.preferredMechanicId);

  if (!vehicleReg) return apiError("We need your registration number to book this repair.", 400);
  if (!vehicleMake) return apiError("We need your vehicle's make to book this repair.", 400);
  if (!repairNodeId) return apiError("Choose the repair you need first.", 400);
  if (!customerName) return apiError("Enter the name we should put on the booking.", 400);
  if (!addressLine1) return apiError("Enter the address we're coming to.", 400);
  if (!postcode) return apiError("Enter the postcode we're coming to.", 400);

  // A slot we can't parse would be written to the row and then rendered to the
  // customer and the mechanic as "Invalid Date". Catch it here.
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
    return apiError("Choose a date and arrival window for your booking.", 400);
  }

  if (!PARKING_TYPES.includes(parkingType as ParkingType)) {
    return apiError("Tell us where the mechanic should park.", 400);
  }

  if (paymentMode !== "preauth" && paymentMode !== "free") {
    return apiError("Something went wrong with your payment. Please try booking again.", 400);
  }

  // 'preauth' without the confirmed hold would write a booking with no money
  // behind it — there'd be nothing to capture when the job completes.
  if (paymentMode === "preauth" && !stripePaymentIntentId) {
    return apiError("Your payment hasn't been confirmed yet. Please try again.", 400);
  }

  const creditRaw = body.creditAppliedPence;
  const creditAppliedPence =
    typeof creditRaw === "number" && Number.isFinite(creditRaw) ? Math.max(0, Math.round(creditRaw)) : 0;

  const limited = await enforceBookingLimits(request, caller, "booking");
  if (limited) return limited;

  const input: CreateBookingInput = {
    vehicleReg,
    vehicleMake,
    vehicleModel: vehicleModel || undefined,
    repairNodeId,
    scheduledAt,
    slotWindow: slotWindow || undefined,
    // From the verified token, never the body — see the note above.
    customerEmail: caller.email,
    customerName,
    addressLine1,
    addressLine2: addressLine2 || undefined,
    postcode,
    parkingType,
    specialInstructions: specialInstructions || undefined,
    // 'free' takes no card, so any intent id sent with one is ignored rather
    // than stamped onto a booking that has nothing to capture.
    stripePaymentIntentId:
      paymentMode === "preauth" ? stripePaymentIntentId : undefined,
    paymentMode,
    creditAppliedPence,
    // "Book again with the same mechanic". Lands as bookings.preferred_mechanic_id,
    // which makes dispatch offer the job to that mechanic FIRST (exclusively,
    // while they're online and eligible) — same as the website's `?pref=`.
    // A malformed id is IGNORED rather than refused: by the time this is called
    // the pre-auth hold is already confirmed on the device, and failing a paid
    // booking over an optional hint would strand that hold. Dispatch itself
    // falls through to a normal broadcast if the mechanic doesn't exist.
    preferredMechanicId: isUuid(preferredMechanicId) ? preferredMechanicId : undefined,
  };

  const result = await createBooking(input, caller.userId);
  return apiOk(result);
}
