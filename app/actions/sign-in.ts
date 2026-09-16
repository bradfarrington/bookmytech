"use server";

import { redirect } from "next/navigation";
import { safeCustomerNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string } | null;

type AuthedClient = Awaited<ReturnType<typeof createClient>>;

type AuthResult =
  | { error: string }
  | { supabase: AuthedClient; role: string };

// Where each role lands after a successful sign-in.
const DEST_FOR_ROLE: Record<string, string> = {
  admin: "/admin",
  mechanic: "/mechanic/jobs",
  customer: "/dashboard",
};

// Validate credentials and resolve the account's role. Returns a form-ready
// error string on failure, or the authenticated client + role on success.
// Never calls redirect() — callers decide where each role lands so this can
// back both the unified door and the role-specific login pages.
async function authenticate(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "That email and password didn't match." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  return { supabase, role: profile?.role ?? "customer" };
}

// Unified sign-in for the public /login door — works for every role. The role
// is read from profiles, so there's no need to ask people which kind of account
// they have; we just route them to the area they belong to. Middleware re-checks
// the role on every protected request.
//
// A customer who was sent here from a deep link carries it in the form's hidden
// `next` field, and goes there instead of to the dashboard root. Only customers:
// `next` describes a page a *customer* wanted, so honouring it for an admin or
// mechanic would just bounce off that area's gate. safeCustomerNext() rejects
// anything off-site or outside /dashboard and /book.
export async function signInUnified(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const result = await authenticate(formData);
  if ("error" in result) return result;
  const dest = DEST_FOR_ROLE[result.role] ?? "/dashboard";
  const wanted =
    result.role === "customer" ? safeCustomerNext(formData.get("next")) : null;
  redirect(wanted ?? dest);
}

// Admin-only sign-in for the dedicated /admin/login page. Rejects non-admins at
// submission with a friendlier message; proxy re-checks on every /admin/*.
export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const result = await authenticate(formData);
  if ("error" in result) return result;
  if (result.role !== "admin") {
    await result.supabase.auth.signOut();
    return { error: "This account doesn't have admin access." };
  }
  redirect("/admin");
}

// Mechanic-only sign-in for the dedicated /mechanic/login page. Mechanic
// access = having a mechanics row (an admin can also be a mechanic while
// keeping role='admin'); proxy re-checks on every /mechanic/* request.
export async function signInMechanic(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const result = await authenticate(formData);
  if ("error" in result) return result;
  const {
    data: { user },
  } = await result.supabase.auth.getUser();
  const { data: mech } = await result.supabase
    .from("mechanics")
    .select("id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (!mech) {
    await result.supabase.auth.signOut();
    return { error: "This account isn't set up as a mechanic." };
  }
  redirect("/mechanic/jobs");
}
