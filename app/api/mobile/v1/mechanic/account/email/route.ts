import { requestEmailChangeFor } from "@/lib/account/email-change";
import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, clientIp, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/mechanic/account/email — ask to move the account to a new
// address. AUTHENTICATED, mechanics only.
//
// The mechanic twin of POST /api/mobile/v1/account/email (Task 58), which
// refuses a staff token and so cannot serve a mechanic. Same core, same body,
// same response shape, same confirmation web page.
//
// Body: { new_email: string, current_password: string }
//   Both required. The password is checked server-side BEFORE anything is sent.
//
// 200: { ok: true, sentTo } — a confirmation link is now in the new inbox, and
//      the current address has been told. NOTHING has changed yet.
//      { ok: false, error, field? } — a refusal is a request that RAN with a
//      negative answer (wrong password, address in use, same address). The app
//      shows `error` VERBATIM. `field` is "new_email" | "password" when the
//      message belongs beside one input.
// Only transport-level problems get a non-2xx: 401, 403 (not a mechanic),
// 400/415, 429, 500.
//
// `pending_email_changes.customer_id` is a `profiles` FK, not a customers FK, so
// the core works for a mechanic unchanged. The trigger that carries a confirmed
// change onto bookings and reminders (0065) is on `auth.users` and matches by
// `customer_id`, so for a mechanic it simply finds nothing — which is right: a
// mechanic's address is never copied onto a booking.
//
// There is deliberately no endpoint to CONFIRM the change. The link opens our
// own web page (/account/confirm-email), which works whichever device the inbox
// is read on. Afterwards the app's stored session still carries the old address
// until it refreshes, so the app should ask the mechanic to sign in again.
//
// THE COOKIE/BEARER TRAP: nothing here touches lib/supabase/server.ts.

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

  const auth = await mobileMechanicCaller(request, "action");
  if (!auth.ok) return auth.response;

  try {
    const result = await requestEmailChangeFor(
      { userId: auth.caller.userId, email: auth.caller.email },
      { newEmail, currentPassword },
      { ip: clientIp(request) },
    );
    return apiOk(result);
  } catch (err) {
    console.error("[mechanic/account/email] failed", auth.caller.userId, err);
    return apiError(
      "We couldn't start the email change just now. Please try again shortly.",
      500,
    );
  }
}
