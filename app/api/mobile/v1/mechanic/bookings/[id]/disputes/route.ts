import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { openDisputeFor, ownEvidencePhotos } from "@/lib/disputes/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownedBooking } from "@/lib/mechanics/owned-booking";

// POST /api/mobile/v1/mechanic/bookings/[id]/disputes — raise an issue with a
// job, as its mechanic. AUTHENTICATED, mechanics only. The mobile twin of the
// website's `openDispute()`; both run `openDisputeFor` (lib/disputes/core.ts),
// so the booking moves to `disputed`, the `dispute_opened` event is written and
// the customer and Book My Tech are emailed, identically.
//
// Body: { reasonCategory, description, photos? }
//       reasonCategory  a `value` from `mechanicReasons` (GET …/disputes/<id>,
//                       or lib/disputes/constants.ts MECHANIC_REASONS)
//       description     at least 30 characters
//       photos          up to 6 URLs from POST …/mechanic/disputes/photos.
//                       Anything that isn't the caller's own upload is dropped.
// 200:  { disputeId }
// 400:  no reason, or the description is too short.
// 409:  the job isn't en route, in progress or completed — or it already has a
//       dispute (a booking has one at most).
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Raising an issue decides nothing and moves no money. Only Book My Tech
// resolves a dispute.

interface OpenBody {
  reasonCategory?: unknown;
  description?: unknown;
  photos?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<OpenBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  // The core takes either party to the booking. This route is the mechanic's,
  // so a mechanic who is also that booking's CUSTOMER doesn't open one as a
  // customer from here (different reasons, a refund request, a 48-hour window).
  const owned = await ownedBooking(id, auth.caller.userId);
  if (!owned.ok) return refusalResponse("mechanic/disputes/open", owned);

  const { reasonCategory, description, photos } = parsed.body;
  const result = await openDisputeFor(
    id,
    {
      reasonCategory: typeof reasonCategory === "string" ? reasonCategory : "",
      description: typeof description === "string" ? description : "",
      photos: ownEvidencePhotos(createAdminClient(), photos, auth.caller.userId, "disputes"),
    },
    { userId: auth.caller.userId, email: auth.caller.email },
  );
  if (!result.ok) return refusalResponse("mechanic/disputes/open", result);
  return apiOk({ disputeId: result.disputeId });
}
