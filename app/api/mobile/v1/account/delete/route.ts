import { AccountDeletionError, deleteCustomerAccountFor } from "@/lib/account/delete-account";
import { enforceBookingLimits, requireMobileCustomer } from "@/lib/mobile/booking-guards";
import { apiError, apiOk, clientIp, readJsonBody } from "@/lib/mobile/respond";
import { bearerToken } from "@/lib/supabase/mobile";

// POST /api/mobile/v1/account/delete — the customer deletes their own account.
// AUTHENTICATED, customers only. App Store guideline 5.1.1(v).
//
// Body: { confirm: true } — refused (400) without it. An empty body must never
//       be enough to delete an account; the field is a tripwire, not data.
// 200:  { ok: true } | { ok: false, code, error }
//       code ∈ live_booking | open_dispute | pending_quote. A refusal is a
//       request that RAN with a negative answer; the app shows `error`
//       verbatim. Only transport-level problems return `{ error }` with a
//       non-2xx: 401, 403 (staff token), 400/415, 429, 500.
//
// The app re-checks the customer's password with signInWithPassword right
// before this call, so the token was minted seconds ago. The password is not
// asked for again and the body does not carry it.
//
// WHOSE account goes is decided by the verified token and nothing else. The
// body carries no id and none would be read. A staff token is 403'd by
// `requireMobileCustomer`: an admin deleting "their" account through the
// customer app would take the admin role with it.
//
// Thin wrapper over `deleteCustomerAccountFor` (lib/account/delete-account.ts),
// which owns the refusals, the order of operations and the audit row.
//
// THE COOKIE/BEARER TRAP: nothing here touches lib/supabase/server.ts. See
// lib/supabase/mobile.ts.

interface DeleteBody {
  confirm?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<DeleteBody>(request);
  if (!parsed.ok) return parsed.response;
  if (parsed.body.confirm !== true) {
    return apiError("Please confirm that you want to delete your account.", 400);
  }

  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;

  // Same bucket family as cancel and reschedule.
  const limited = await enforceBookingLimits(request, auth.caller, "action");
  if (limited) return limited;

  // requireMobileCustomer already proved the header parses; this can't be null.
  const accessToken = bearerToken(request);
  if (!accessToken) return apiError("Please sign in to continue.", 401);

  try {
    const result = await deleteCustomerAccountFor(
      { userId: auth.caller.userId, email: auth.caller.email, accessToken },
      { source: "mobile", ip: clientIp(request) },
    );
    return apiOk(result);
  } catch (err) {
    const step = err instanceof AccountDeletionError ? err.step : "unknown";
    console.error(`[account/delete] failed (${step})`, auth.caller.userId, err);
    return apiError(
      "We couldn't finish deleting your account. Please sign in and try again, or contact support.",
      500,
    );
  }
}
