import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { completeAndChargeFor } from "@/lib/mechanics/job-progress";

// POST /api/mobile/v1/mechanic/bookings/[id]/complete — in_progress →
// completed, and the money moves: the customer's pre-authorisation is captured
// and the mechanic's share transferred. AUTHENTICATED, mechanics only. The
// mobile twin of the website's `completeAndCharge()`; both run
// lib/mechanics/job-progress.ts, so the captures, events, payout, receipt
// email, SMS and reminders are identical.
//
// No body. There is no customer signature — removed on the owner's instruction
// (2026-09-08); the mechanic's confirmation in the app is the record.
// 200:  { status: "completed", chargedPence, payoutPence }
// 409:  it can't complete right now, and the sentence says why:
//         · an unfinished checklist, or no mileage on a checklist job
//         · a quote or a revised job still waiting on the customer
//         · the job isn't `in_progress`
//         · "Couldn't take payment: … The job stays open. Try again." — the
//           capture failed. NOTHING has changed: the job is still in_progress
//           and the same call can be made again.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// SAFE TO RETRY. Every capture reads the PaymentIntent first and takes an
// already-succeeded one as done, so a retry after a timeout — or after a later
// step failed — never charges twice. Once the job is `completed` a repeat is a
// 409, not a second payout.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const result = await completeAndChargeFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/complete", result);
  return apiOk({ status: "completed", chargedPence: result.chargedPence, payoutPence: result.payoutPence });
}
