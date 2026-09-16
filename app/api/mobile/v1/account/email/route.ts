import { requestEmailChangeFor } from "@/lib/account/email-change";
import { enforceBookingLimits, requireMobileCustomer } from "@/lib/mobile/booking-guards";
import { apiError, apiOk, clientIp, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/account/email — ask to move the account to a new address.
// AUTHENTICATED, customers only.
//
// NEW in Task 58. The app currently calls `supabase.auth.updateUser({ email })`
// itself, which means GoTrue sends its own "Confirm Email Change" template and
// its link goes through <project>.supabase.co/auth/v1/verify and then a
// `bmtcustomer:///email-changed` deep link. Brad's note on Task 55 was that
// every screen, email and link a customer sees should be ours. This endpoint is
// the replacement; the app should stop calling Supabase directly.
//
// Body: { new_email: string, current_password: string }
//   Both required. The password is checked server-side BEFORE anything is sent
//   — that guard didn't exist in the old flow, where the session alone was
//   enough, so this is stricter than what it replaces.
//
// 200: { ok: true, sentTo } — a confirmation link is now in the new inbox, and
//      the current address has been told. NOTHING has changed yet.
//      { ok: false, error, field? } — a refusal is a request that RAN with a
//      negative answer (wrong password, address in use, same address). The app
//      shows `error` VERBATIM; it is written for a customer. `field` is
//      "new_email" | "password" when the message belongs beside one input.
// Only transport-level problems get a non-2xx: 401, 403 (staff token),
// 400/415, 429, 500.
//
// There is deliberately no endpoint to CONFIRM the change. The link in the email
// opens our own web page (/account/confirm-email), which works whether or not
// the app is installed and whichever device the inbox is read on. Once
// confirmed, the app's stored session still carries the old address until it
// refreshes, so the app should ask the customer to sign in again — the same as
// the website does.
//
// Thin wrapper over `requestEmailChangeFor` (lib/account/email-change.ts), the
// same core the website's server action uses.
//
// THE COOKIE/BEARER TRAP: nothing here touches lib/supabase/server.ts. See
// lib/supabase/mobile.ts.

interface EmailChangeBody {
  new_email?: unknown;
  current_password?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<EmailChangeBody>(request);
  if (!parsed.ok) return parsed.response;

  const newEmail = parsed.body.new_email;
  const currentPassword = parsed.body.current_password;
  if (typeof newEmail !== "string" || !newEmail.trim()) {
    return apiError("Enter the email address you'd like to use.", 400);
  }
  if (typeof currentPassword !== "string" || !currentPassword) {
    return apiError("Enter your current password.", 400);
  }

  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;

  // Same bucket family as the other account-management actions. It matters more
  // here than most: this endpoint sends two emails and checks a password, so it
  // is the sort of thing worth guessing at.
  const limited = await enforceBookingLimits(request, auth.caller, "action");
  if (limited) return limited;

  try {
    const result = await requestEmailChangeFor(
      { userId: auth.caller.userId, email: auth.caller.email },
      { newEmail, currentPassword },
      { ip: clientIp(request) },
    );
    return apiOk(result);
  } catch (err) {
    console.error("[account/email] failed", auth.caller.userId, err);
    return apiError(
      "We couldn't start the email change just now. Please try again shortly.",
      500,
    );
  }
}
