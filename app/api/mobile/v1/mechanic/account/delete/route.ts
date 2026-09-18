import {
  MechanicDeletionError,
  deleteMechanicAccountFor,
} from "@/lib/account/delete-mechanic-account";
import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, clientIp, readJsonBody } from "@/lib/mobile/respond";
import { bearerToken } from "@/lib/supabase/mobile";

// POST /api/mobile/v1/mechanic/account/delete — the mechanic deletes their own
// account. AUTHENTICATED, mechanics only. App Store guideline 5.1.1(v) applies
// to the mechanic app too, and a mechanic can sign up in it.
//
// Body: { confirm: true } — refused (400) without it. An empty body must never
//       be enough to delete an account; the field is a tripwire, not data.
// 200:  { ok: true } | { ok: false, code, error }
//       code ∈ live_booking | open_dispute | open_case | balance_owed |
//              staff_account. A refusal is a request that RAN with a negative
//              answer; the app shows `error` verbatim. Only transport-level
//              problems return `{ error }` with a non-2xx: 401, 403 (not a
//              mechanic), 400/415, 429, 500.
//
// The app re-checks the mechanic's password with signInWithPassword right
// before this call, so the token was minted seconds ago. The password is not
// asked for again and the body does not carry it — the same contract as the
// customer route.
//
// WHOSE account goes is decided by the verified token and nothing else. The body
// carries no id and none would be read. An account that ALSO has admin access is
// refused (`staff_account`): deleting it here would take the admin role and
// everything it can reach with it.
//
// `delete_customer_account()` is not enough here — see
// lib/account/delete-mechanic-account.ts, which owns the blockers, the order of
// operations, the bucket cleanup and the audit row.
//
// THE COOKIE/BEARER TRAP: nothing here touches lib/supabase/server.ts.

interface DeleteBody {
  confirm?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<DeleteBody>(request);
  if (!parsed.ok) return parsed.response;
  if (parsed.body.confirm !== true) {
    return apiError("Please confirm that you want to delete your account.", 400);
  }

  const auth = await mobileMechanicCaller(request, "action");
  if (!auth.ok) return auth.response;

  // mobileMechanicCaller already proved the header parses; this can't be null.
  const accessToken = bearerToken(request);
  if (!accessToken) return apiError("Please sign in to continue.", 401);

  try {
    const result = await deleteMechanicAccountFor(
      { userId: auth.caller.userId, email: auth.caller.email, accessToken },
      { source: "mobile", ip: clientIp(request) },
    );
    return apiOk(result);
  } catch (err) {
    const step = err instanceof MechanicDeletionError ? err.step : "unknown";
    console.error(`[mechanic/account/delete] failed (${step})`, auth.caller.userId, err);
    return apiError(
      "We couldn't finish deleting your account. Please sign in and try again, or contact support.",
      500,
    );
  }
}
