import { sendDisputeMessageFor } from "@/lib/disputes/core";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/disputes/:id/messages — post into the dispute thread.
// AUTHENTICATED.
//
// Body: { body }
// 200:  { ok: true } | { ok: false, error }. "This dispute is closed" is a
//       request that RAN with a negative answer. Only transport-level problems
//       return `{ error }` with a non-2xx: 401, 400/415, 429.
//
// Thin wrapper over `sendDisputeMessageFor` — the SAME function the website's
// dispute thread calls through app/actions/disputes.ts. The first reply from
// whoever DIDN'T open the case flips it opened → responded and emails the admin
// team; every reply nudges the mechanic. That lifecycle lives in the core.
//
// The thread is three-party (customer / mechanic / admin mediator), so a
// customer will see admin messages appear in it. The sender's role is derived
// from their relationship to the booking, never sent.
//
// OWNERSHIP: the core refuses anyone who isn't a party to the dispute, so
// knowing a dispute id gets you nothing.
//
// READS go direct to Supabase under the "Parties read dispute thread" policy
// (0025) — no endpoint needed, same as bookings.

interface MessageBody {
  body?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that dispute.", 400);

  const parsed = await readJsonBody<MessageBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "message");
  if (!auth.ok) return auth.response;

  const body = typeof parsed.body.body === "string" ? parsed.body.body : "";

  return apiOk(await sendDisputeMessageFor(id, body, auth.caller.userId));
}
