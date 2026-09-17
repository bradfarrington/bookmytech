import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { liveOfferSummariesFor } from "@/lib/mechanics/offer-summaries";

// GET /api/mobile/v1/mechanic/offers — the caller's LIVE job offers, newest
// first. AUTHENTICATED, mechanics only.
//
// 200:  { offers: OfferSummary[] } — see lib/mechanics/offer-summaries.ts for
//       the shape. `?offerId=<uuid>` narrows it to one (a push deep link); an
//       offer that has been answered or superseded is simply absent.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// This is what the app draws an offer card from, NOT a direct read of the
// offered `bookings` row: that row carries the customer's name, phone and street
// address, which a mechanic should only get once the job is theirs. The summary
// gives the district and a distance instead.
//
// There is no expiry to count down against. Offers are broadcast and
// first-to-accept (0008); one ends when somebody accepts, not on a timer.
// `offeredAt` is there for "offered 2 min ago".

export async function GET(request: Request): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const offerId = new URL(request.url).searchParams.get("offerId") ?? undefined;
  if (offerId !== undefined && !/^[0-9a-f-]{36}$/i.test(offerId)) return apiOk({ offers: [] });

  try {
    return apiOk({ offers: await liveOfferSummariesFor(auth.caller.userId, offerId) });
  } catch (err) {
    console.error("[mechanic/offers] failed", err);
    return apiError("We couldn't load your job offers. Please try again in a moment.", 500);
  }
}
