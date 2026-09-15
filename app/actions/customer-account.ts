"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requestPasswordReset } from "@/app/actions/booking-account";
import { AccountDeletionError, deleteCustomerAccountFor } from "@/lib/account/delete-account";
import { MIN_PASSWORD_LENGTH } from "@/lib/customers/provision";
import { createClient } from "@/lib/supabase/server";

// The Account screens' password change and account deletion (Task 48). Every
// action resolves the caller from the cookie session; nothing in a form names
// an account. Deletion is a thin wrapper over deleteCustomerAccountFor, the
// same core the mobile route (app/api/mobile/v1/account/delete) wraps.
//
// Both ask for the current password first. It's checked with a STATELESS
// client: no cookies and nothing persisted, so the check never touches the
// session this browser is signed in with. The throwaway session a correct
// check creates is ended straight away.

const SUPPORT_EMAIL = "support@bookmytech.co.uk";

export type PasswordChangeState =
  | { ok: true }
  | { ok: false; error: string; field?: "current" | "new" | "confirm" }
  | null;

export type AccountDeletionState = { error: string } | null;

export type ResetLinkResult = { ok: true } | { ok: false; error: string };

type PasswordCheck = "ok" | "wrong" | "throttled" | "failed";

async function checkPassword(email: string, password: string): Promise<PasswordCheck> {
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
      console.error("[customer-account] password check failed", error.code ?? error.status, error.message);
      return "failed";
    }
    if (data.session) {
      // "local" ends only the check's own session, never the browser's.
      await stateless.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    return "ok";
  } catch (err) {
    console.error("[customer-account] password check threw", err);
    return "failed";
  }
}

async function callerIp(): Promise<string | null> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

/** Change the signed-in customer's password, after checking their current one. */
export async function changePassword(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!current) return { ok: false, field: "current", error: "Enter your current password." };
  // The same rule as signup (lib/customers/provision.ts).
  if (next.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      field: "new",
      error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (next !== confirm) return { ok: false, field: "confirm", error: "Your new passwords don't match." };
  if (next === current) {
    return { ok: false, field: "new", error: "Choose a new password that's different from your current one." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Please sign in again to change your password." };

  const check = await checkPassword(user.email, current);
  if (check === "wrong") {
    return { ok: false, field: "current", error: "That isn't your current password. Please try again." };
  }
  if (check === "throttled") {
    return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };
  }
  if (check === "failed") {
    return { ok: false, error: "We couldn't check your password just now. Please try again." };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    if (error.code === "same_password") {
      return { ok: false, field: "new", error: "Choose a new password that's different from your current one." };
    }
    if (error.code === "weak_password") {
      return {
        ok: false,
        field: "new",
        error: "Choose a stronger password. A longer one with numbers or symbols works best.",
      };
    }
    if (error.code === "reauthentication_needed") {
      return { ok: false, error: "For your security, please sign out, sign back in and try again." };
    }
    console.error("[customer-account] password update failed", user.id, error.code, error.message);
    return { ok: false, error: "We couldn't change your password just now. Please try again." };
  }

  return { ok: true };
}

/** Email the signed-in customer a password reset link, to their own address. */
export async function sendPasswordResetLink(): Promise<ResetLinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Please sign in again to reset your password." };
  return requestPasswordReset(user.email);
}

/**
 * Delete the signed-in customer's account. Refusals (a live booking, an open
 * dispute, a quote waiting on them) come back as the core's own sentence. On
 * success the browser's session is cleared and they land on the homepage.
 */
export async function deleteAccount(
  _prev: AccountDeletionState,
  formData: FormData,
): Promise<AccountDeletionState> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password to confirm." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Please sign in again to delete your account." };

  // A staff account must never go through the customer deletion: it would take
  // the role with it. The same refusal as the mobile route's staffRefusal.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { error: "We couldn't delete your account just now. Please try again." };
  const role = (profile as { role?: string } | null)?.role;
  if (role === "admin" || role === "mechanic") {
    return { error: `This is a staff account, so it can't be deleted here. Please email ${SUPPORT_EMAIL}.` };
  }

  const check = await checkPassword(user.email, password);
  if (check === "wrong") return { error: "That password isn't right. Please try again." };
  if (check === "throttled") return { error: "Too many attempts. Please wait a few minutes and try again." };
  if (check === "failed") return { error: "We couldn't check your password just now. Please try again." };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "Please sign in again to delete your account." };

  try {
    const result = await deleteCustomerAccountFor(
      { userId: user.id, email: user.email, accessToken: session.access_token },
      { source: "web", ip: await callerIp() },
    );
    if (!result.ok) return { error: result.error };
  } catch (err) {
    const step = err instanceof AccountDeletionError ? err.step : "unknown";
    console.error(`[account/delete] web failed (${step})`, user.id, err);
    return {
      error: `We couldn't finish deleting your account. Please sign in again and retry, or email ${SUPPORT_EMAIL} and we'll sort it out.`,
    };
  }

  // Every session was already revoked by the core; this clears this browser's cookies.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("[account/delete] clearing the web session failed", user.id, err);
  }
  redirect("/");
}
