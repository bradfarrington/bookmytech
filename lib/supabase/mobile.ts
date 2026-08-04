import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase auth for the mobile app.
//
// `lib/supabase/server.ts` builds its client from COOKIES. Mobile requests carry
// `Authorization: Bearer <supabase access token>` and no cookies at all, so a
// route handler that reached for the cookie client would get a null session —
// silently, with no error. That is not a 401 you'd notice in testing, it is a
// wrong answer: a booking's `customer_id` is the caller, so a cookie-authed
// mobile booking would be written as a GUEST booking. The job would never appear
// in the customer's account, and account credit and preferred-mechanic handling
// would be skipped. It would pass a smoke test.
//
// This is why the booking core lives in `lib/bookings/create-booking.ts` and
// takes `customerId` as a parameter: the website's Server Actions resolve it
// from the cookie session, the mobile route handlers from a verified token, and
// neither client can supply it.
//
// So: every authenticated mobile route resolves its caller through
// `requireMobileUser()` and threads the id through explicitly. No mobile request
// may reach cookie-derived auth.

/** What a verified Bearer token resolves to. */
export interface MobileCaller {
  userId: string;
  email: string | null;
  /** From `profiles.role` — 'customer' | 'mechanic' | 'admin'. Null if no profile row. */
  role: string | null;
  /**
   * A Supabase client that acts AS this user: RLS applies exactly as it does in
   * the browser, so a mobile read can never see more than the web app would.
   */
  supabase: SupabaseClient;
}

export type MobileAuthResult =
  | { ok: true; caller: MobileCaller }
  /** Ready-to-return 401. The message is customer-facing. */
  | { ok: false; status: 401; error: string };

/**
 * A Supabase client authenticated from a Bearer token rather than cookies.
 *
 * The token is attached as the request Authorization header, so Postgres sees
 * the caller's `auth.uid()` and every RLS policy applies unchanged. Session
 * persistence and refresh are off — a route handler is a single request, and
 * refreshing is the app's job (it owns the refresh token; we never see it).
 */
export function createMobileClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );
}

/** Pull the raw token out of `Authorization: Bearer <token>`. Case-insensitive scheme. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Resolve the caller if there is one, without demanding it.
 *
 * For endpoints a guest may legitimately call (the app lets people price a job
 * before making an account) but where a signed-in caller should still be
 * identified — per-user rate limits, say. A missing or bad token is simply
 * "guest"; it never fails the request.
 */
export async function optionalMobileUser(request: Request): Promise<MobileCaller | null> {
  if (!bearerToken(request)) return null;
  const result = await requireMobileUser(request);
  return result.ok ? result.caller : null;
}

/**
 * Resolve the caller of an authenticated mobile request.
 *
 * Returns 401 when the header is missing, malformed, or the token is expired or
 * invalid. `getUser()` (not `getSession()`) is deliberate: it verifies the JWT
 * with Supabase rather than trusting its claims, so a forged or stale token
 * can't get through.
 */
export async function requireMobileUser(request: Request): Promise<MobileAuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Please sign in to continue." };
  }

  const supabase = createMobileClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, error: "Your session has expired — please sign in again." };
  }

  // Role decides what a caller may do (staff sessions can't book, for one). Read
  // it under the caller's own RLS: profiles has a select-own policy.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    ok: true,
    caller: {
      userId: data.user.id,
      email: data.user.email ?? null,
      role: (profile?.role as string | undefined) ?? null,
      supabase,
    },
  };
}
