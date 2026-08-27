import { openDisputeFor, type OpenDisputeInput } from "@/lib/disputes/core";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/disputes — raise a dispute on a job.
// AUTHENTICATED.
//
// Body: { reasonCategory, description, photos?, refundRequestedPence? }
//       `reasonCategory` is one of CUSTOMER_REASONS in lib/disputes/constants.ts:
//       workmanship | parts_cost | price | conduct | damage | other.
//       `description` needs MIN_DESCRIPTION_CHARS (30) characters.
//       `photos` are URLs returned by POST /disputes/photos — upload first, then
//       open with what you got back. Capped at MAX_DISPUTE_PHOTOS (6).
// 200:  { ok: true, disputeId } | { ok: false, error }. "The 48-hour window has
//       passed", "there's already an open dispute" and "you can raise a dispute
//       once the job is complete" are requests that RAN with a negative answer.
//       Only transport-level problems return `{ error }` with a non-2xx: 401,
//       400/415 (bad body or id), 429.
//
// Thin wrapper over `openDisputeFor` — the SAME function the website's dispute
// form calls through app/actions/disputes.ts. Opening also moves the booking to
// `disputed` and emails the admin team and the other party. The mechanic's
// completion payout is left alone — a refund, if the admin grants one, is
// clawed back through the mechanic ledger at resolution. None of that is
// repeated here.
//
// OWNERSHIP is derived, not claimed: the core works out whether the caller is
// this booking's customer or its mechanic and refuses anyone who is neither. The
// app only ever hits the customer arm, and the 48-hour-from-completion window is
// the customer rule.
//
// READS need no endpoint. `disputes` and `dispute_messages` both carry a
// "parties read" SELECT policy (0025), so the app fetches the dispute and its
// thread straight from Supabase like it does bookings.

interface DisputeBody {
  reasonCategory?: unknown;
  description?: unknown;
  photos?: unknown;
  refundRequestedPence?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const parsed = await readJsonBody<DisputeBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const { reasonCategory, description, photos, refundRequestedPence } = parsed.body;
  if (typeof reasonCategory !== "string" || !reasonCategory.trim()) {
    return apiError("Pick a reason for the dispute.", 400);
  }
  if (typeof description !== "string") {
    return apiError("Please describe what went wrong.", 400);
  }

  const input: OpenDisputeInput = {
    reasonCategory: reasonCategory.trim(),
    description,
    photos: Array.isArray(photos)
      ? photos.filter((p): p is string => typeof p === "string" && p.length > 0)
      : undefined,
    refundRequestedPence:
      typeof refundRequestedPence === "number" && Number.isFinite(refundRequestedPence)
        ? refundRequestedPence
        : null,
  };

  return apiOk(await openDisputeFor(id, input, auth.caller.userId));
}
