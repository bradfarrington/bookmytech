import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { endJobOnSite } from "@/lib/revisions/mechanic";
import type { OnSiteCharge } from "@/lib/revisions/status";

// POST /api/mobile/v1/mechanic/bookings/[id]/end-on-site — the customer
// declined the revised job (or never answered) and the booked work can't go
// ahead: end the job, and the money moves. AUTHENTICATED, mechanics only. The
// mobile twin of the website's `endJobOnSiteAction()` (`endJobOnSite`,
// lib/revisions/mechanic.ts): the fee is captured from the customer's hold and
// the rest released, the mechanic is paid the fee less commission, and the
// customer is told. The booking becomes `cancelled`.
//
// Body: { charge, note? } — `charge` is a `kind` from `onSiteOptions` on
//       GET …/revision: "diagnostic" | "cancellation" | "none".
// 200:  { status: "cancelled", chargedPence, payoutPence } — what the
//       customer's card was charged and the mechanic's share of it; both 0 for
//       "none", or when there was no card hold to take a fee from.
// 400:  not one of the three.
// 409:  it can't be ended this way right now, and the sentence says why:
//         · no revision has been declined, or one is still waiting
//         · the job isn't `in_progress`
//         · "Couldn't settle the customer's payment hold: … Nothing was
//           changed. Try again." — the same call can be made again.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// SAFE AGAINST A DOUBLE CALL, the same way POST …/complete is. Settling the
// hold reads an already-captured intent back rather than capturing again, and
// the status change is a claim: of two overlapping calls only the one that
// actually changes the row pays the mechanic. The other gets a 409.

interface EndBody {
  charge?: unknown;
  note?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<EndBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const { charge, note } = parsed.body;
  const result = await endJobOnSite(auth.caller.userId, {
    bookingId: id,
    // Anything that isn't one of the three is refused by the core.
    charge: (typeof charge === "string" ? charge : "") as OnSiteCharge,
    note: typeof note === "string" ? note : null,
  });
  if (!result.ok) return refusalResponse("mechanic/end-on-site", result);
  return apiOk({ status: result.status, chargedPence: result.chargedPence, payoutPence: result.payoutPence });
}
