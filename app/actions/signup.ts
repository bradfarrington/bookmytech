"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkGuestBookings } from "@/app/actions/link-guest-bookings";
import { generateReferralCode, normaliseReferralCode } from "@/lib/credits/referral-code";
import { grantCredit } from "@/lib/credits/credits";
import { REFERRAL_WELCOME_PENCE } from "@/lib/credits/constants";

export type SignUpState = { error: string } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Customer self-signup, offered after a booking ("create an account to track").
//
// We create the auth user with the service-role client (email_confirm: true) so
// the customer gets an immediate session regardless of the project's email-
// confirmation setting — the same approach used for mechanic/admin provisioning
// — then sign them in with their password to set the SSR cookies. The
// handle_new_user trigger auto-inserts their profile with role='customer'.
export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const referrerCode = normaliseReferralCode(String(formData.get("referral_code") ?? ""));

  if (!fullName) return { error: "Enter your name." };
  if (!email || !EMAIL_RE.test(email))
    return { error: "Enter a valid email address." };
  if (password.length < 8)
    return { error: "Choose a password of at least 8 characters." };

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created.user) {
    const msg = createErr?.message ?? "Couldn't create your account.";
    return {
      error: msg.toLowerCase().includes("registered")
        ? "An account with that email already exists — try signing in instead."
        : msg,
    };
  }

  const userId = created.user.id;

  // Resolve the referrer (if a code was supplied) before we touch the profile,
  // so a self-referral or bad code just no-ops.
  let referredBy: string | null = null;
  if (referrerCode) {
    const { data: referrer } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", referrerCode)
      .maybeSingle();
    if (referrer && referrer.id !== userId) referredBy = referrer.id;
  }

  // Write the name + a unique referral code onto the profile (the trigger only
  // seeds role + id reliably). Retry on the off chance of a code collision.
  let ownCode = generateReferralCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin
      .from("profiles")
      .update({ full_name: fullName, referral_code: ownCode, referred_by: referredBy })
      .eq("id", userId);
    if (!error) break;
    // 23505 = unique_violation on referral_code — regenerate and retry.
    if (error.code === "23505") {
      ownCode = generateReferralCode();
      continue;
    }
    // Any other error: still set the name so the account is usable.
    await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
    break;
  }

  // Referee welcome credit — £10 off their first booking. Granted once.
  if (referredBy) {
    await grantCredit(
      admin,
      userId,
      REFERRAL_WELCOME_PENCE,
      "referral_welcome",
      "Welcome credit for joining via a referral",
    );
  }

  // Pull any guest bookings made with this email under the new account.
  await linkGuestBookings(userId, email);

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
