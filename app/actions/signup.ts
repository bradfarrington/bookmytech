"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCustomerAccount } from "@/lib/customers/provision";
import { normaliseReferralCode } from "@/lib/credits/referral-code";
import { safeCustomerNext } from "@/lib/safe-next";

export type SignUpState = { error: string; field?: "referral_code" } | null;

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
  const referrerCode = normaliseReferralCode(String(formData.get("referral_code") ?? ""));

  const admin = createAdminClient();

  // A typed code that matches nobody must be an error, not a silent no-op:
  // createCustomerAccount ignores unknown codes, which is right for a stale
  // share link but would quietly cost someone their £10 when they've mistyped.
  // Check before creating the account so they can fix it and resubmit.
  if (referrerCode) {
    const { data: referrer } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", referrerCode)
      .maybeSingle();
    if (!referrer) {
      return {
        error: "We don't recognise that referral code. Check it with your friend, or leave it blank.",
        field: "referral_code",
      };
    }
  }

  const result = await createCustomerAccount(admin, {
    email,
    password,
    fullName,
    referrerCode,
  });
  if (!result.ok) return { error: result.error };

  // Signup only ever makes a customer, so a `next` from the hidden field is
  // theirs to follow. Someone who signed up *because* a deep link asked them to
  // should land on that page, not on an empty dashboard.
  const wanted = safeCustomerNext(formData.get("next"));

  // Sign in to set the session cookies on the response.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    // Account exists but the cookie didn't set — send them to login to retry,
    // carrying the destination so the retry doesn't lose it either.
    const params = new URLSearchParams({ created: "1" });
    if (wanted) params.set("next", wanted);
    redirect(`/login?${params}`);
  }

  redirect(wanted ?? "/dashboard");
}
