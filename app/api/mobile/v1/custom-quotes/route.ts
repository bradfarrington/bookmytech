import { listCustomQuotesFor } from "@/lib/custom-quotes/server";
import { enforceBookingLimits, requireMobileCustomer } from "@/lib/mobile/booking-guards";
import { apiOk } from "@/lib/mobile/respond";

// GET /api/mobile/v1/custom-quotes — the caller's custom quotes (Task 75):
// jobs we don't list, priced by hand. AUTHENTICATED, customer accounts only.
//
// 200: { quotes: CustomQuoteView[] } newest first, at most 50. Each:
//   { id, status: "requested" | "sent" | "booked" | "declined" | "withdrawn",
//     statusLabel, request, title, details, totalPence, visitHours,
//     vehicle: { reg, make, model }, postcode, canBook, canDecline, bookingId,
//     createdAt, sentAt }
//   title / details / totalPence are null while status is "requested".
//
// BOOKING ONE needs no new endpoint: when `canBook`, send its `id` as
// `quoteId` to POST /checkout/prepare and POST /bookings, exactly as for a
// follow-on quote. vehicleReg, vehicleMake and the repair ids may be omitted;
// the price, the car and the job name come from the quote. It is offered to
// every mechanic. Decline with POST /custom-quotes/:id/decline.
//
// A quote counts as the caller's when it was raised from their account or sent
// to their account's email address.

export async function GET(request: Request): Promise<Response> {
  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;
  const limited = await enforceBookingLimits(request, auth.caller, "account");
  if (limited) return limited;
  const quotes = await listCustomQuotesFor({ userId: auth.caller.userId, email: auth.caller.email });
  return apiOk({ quotes });
}
