import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Re-check a signed-in customer's password before something irreversible:
// changing their password, changing the address that controls password resets,
// or deleting the account.
//
// It was private to app/actions/customer-account.ts until Task 58 needed the
// same check from a route handler (POST /api/mobile/v1/account/email), which
// cannot call a "use server" module. Extracted rather than copied, so the two
// clients can't drift on what counts as a correct password.
//
// A STATELESS client does the check: no cookies, nothing persisted, so it never
// touches the session the browser is signed in with. `signInWithPassword` is
// the only way to verify a password through the API, and it mints a session as a
// side effect — that throwaway session is ended straight away with
// `scope: "local"`, which ends only its own and never the caller's.

export type PasswordCheck = "ok" | "wrong" | "throttled" | "failed";

export async function checkPassword(email: string, password: string): Promise<PasswordCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return "failed";

  const stateless = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { data, error } = await stateless.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.status === 429) return "throttled";
      if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
        return "wrong";
      }
      console.error("[check-password] failed", error.code ?? error.status, error.message);
      return "failed";
    }
    if (data.session) {
      // "local" ends only the check's own session, never the browser's.
      await stateless.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    return "ok";
  } catch (err) {
    console.error("[check-password] threw", err);
    return "failed";
  }
}

/** The one wording for each failed check, so both clients say the same thing. */
export const PASSWORD_CHECK_MESSAGES = {
  wrong: "That isn't your current password. Please try again.",
  throttled: "Too many attempts. Please wait a few minutes and try again.",
  failed: "We couldn't check your password just now. Please try again.",
} as const;
