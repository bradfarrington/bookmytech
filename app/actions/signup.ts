"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCustomerAccount } from "@/lib/customers/provision";

export type SignUpState = { error: string } | null;

// Customer self-signup on the standalone /signup door. The booking flow creates
// accounts too — both go through createCustomerAccount so the profile, referral
// code, welcome credit and guest-booking links are set up identically.
export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const referrerCode = String(formData.get("referral_code") ?? "");

  const result = await createCustomerAccount(createAdminClient(), {
    email,
    password,
    fullName,
    referrerCode,
  });
  if (!result.ok) return { error: result.error };

  // Sign in to set the session cookies on the response.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    // Account exists but the cookie didn't set — send them to login to retry.
    redirect("/login?created=1");
  }

  redirect("/dashboard");
}
