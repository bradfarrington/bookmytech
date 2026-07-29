import { createAdminClient } from "@/lib/supabase/admin";
import { createCustomerAccount } from "@/lib/customers/provision";
import { apiError, apiOk, apiRateLimited, clientIp, readJsonBody } from "@/lib/mobile/respond";
import { DAY_SECONDS, MINUTE_SECONDS, enforceRateLimits } from "@/lib/rate-limit/limiter";

// POST /api/mobile/v1/auth/signup — create a customer account. Unauthenticated.
//
// Body: { email, password, fullName, phone?, referralCode? }
// 201:  { userId }
// 4xx:  { error } — shown to the customer verbatim.
//
// A client-side supabase.auth.signUp() cannot produce a Book My Tech account:
// createCustomerAccount() also creates the user on the SERVICE-ROLE client with
// email_confirm: true (so the app's immediate signInWithPassword works with no
// email round-trip), writes a unique referral_code with collision retry, sets
// referred_by, grants the referral welcome credit, and links any guest bookings
// made with the same email. An account without those is a different SHAPE from a
// web account — which is why this endpoint exists rather than the app doing it.
//
// The one implementation lives in lib/customers/provision.ts and is shared with
// app/actions/signup.ts (the web form) and app/actions/booking-account.ts (the
// funnel). Nothing is duplicated here; if it were, the clients would drift.
//
// We do NOT sign the caller in — the app calls signInWithPassword itself and
// owns the resulting tokens. There is nothing for us to set: no cookies.

interface SignupBody {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  phone?: unknown;
  referralCode?: unknown;
}

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<SignupBody>(request);
  if (!parsed.ok) return parsed.response;

  // Account creation is unauthenticated, so it is limited per IP. Nothing here
  // costs money, but an open createUser endpoint is a spam and enumeration
  // surface, and every attempt writes to auth.users.
  const ip = clientIp(request);
  const verdict = await enforceRateLimits([
    { key: "mobile_signup_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_signup_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
  ]);
  if (!verdict.allowed) {
    return apiRateLimited(
      "Too many sign-up attempts. Please wait a few minutes and try again.",
      verdict.retryAfterSeconds,
    );
  }

  const email = asString(parsed.body.email).toLowerCase();
  const password = typeof parsed.body.password === "string" ? parsed.body.password : "";
  const fullName = asString(parsed.body.fullName);
  const phone = asString(parsed.body.phone) || null;
  const referrerCode = asString(parsed.body.referralCode) || null;

  // Field validation (name present, email shape, 8-character minimum) belongs to
  // createCustomerAccount, so web and app reject the same input with the same
  // wording. Its error strings are already customer-facing.
  const result = await createCustomerAccount(createAdminClient(), {
    email,
    password,
    fullName,
    phone,
    referrerCode,
  });

  if (!result.ok) {
    // 409 for a taken email so the app can offer "sign in instead" rather than
    // showing this as a generic failure. Everything else is a bad request —
    // never a 500, which the app would surface as "something went wrong".
    return apiError(result.error, result.emailTaken ? 409 : 400);
  }

  return apiOk({ userId: result.userId }, 201);
}
