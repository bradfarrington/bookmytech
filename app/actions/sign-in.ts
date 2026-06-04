"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string } | null;

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
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

  // Block non-admin accounts from completing admin sign-in. We re-check this
  // in middleware on every /admin/* request — this is just a friendlier
  // error at the point of submission.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    return { error: "This account doesn't have admin access." };
  }

  redirect("/admin");
}

export async function signInCustomer(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
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

  // Customers carry role='customer' (the handle_new_user default). Block
  // admin/mechanic accounts from the customer dashboard so they land in the
  // right place — middleware re-checks role on every /dashboard request.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profile?.role === "admin") {
    await supabase.auth.signOut();
    return { error: "That's an admin account — sign in at /admin." };
  }
  if (profile?.role === "mechanic") {
    await supabase.auth.signOut();
    return { error: "That's a mechanic account — sign in at /mechanic/login." };
  }

  redirect("/dashboard");
}

export async function signInMechanic(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
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

  // Mirror the admin guard: block non-mechanic accounts at submission. The
  // middleware re-checks role on every /mechanic/* request — this is the
  // friendlier point-of-entry error.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "mechanic") {
    await supabase.auth.signOut();
    return { error: "This account isn't set up as a mechanic." };
  }

  redirect("/mechanic/jobs");
}
