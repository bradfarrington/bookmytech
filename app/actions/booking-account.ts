"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCustomerAccount, validateCustomerInput } from "@/lib/customers/provision";
import { linkGuestBookings } from "@/app/actions/link-guest-bookings";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";

// Account creation inside the booking funnel.
//
// Owner decision 2026-07-29: a customer must have an account before the
// pre-authorisation is taken. It runs BEFORE the hold rather than after so that:
//
//   • a failure here (email already registered, weak password) never leaves an
//     orphaned hold on someone's card — nothing has been authorised yet;
//   • prepareCheckout sees the session and can price account credit into the
//     hold, instead of holding the full amount for a returning customer;
//   • createBookingAction stamps customer_id at insert — no guest backfill.
//
// It is deliberately NOT a separate step in the funnel: the details block the
// checkout already collected simply moved up a screen and gained a password
// field.

export interface EnsureCustomerAccountInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

export type EnsureCustomerAccountResult =
  | { ok: true; created: boolean }
  /** `needsPassword` = the email has an account but the password didn't match;
   *  the funnel switches to a sign-in prompt rather than dead-ending. */
  | { ok: false; error: string; needsPassword?: boolean };

export async function ensureCustomerAccount(
  input: EnsureCustomerAccountInput,
): Promise<EnsureCustomerAccountResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = input.phone?.trim() || null;
  const supabase = await createClient();

  // Already signed in — nothing to do. (The picker hides the block in this
  // case; this is the belt-and-braces path for a session that appeared
  // mid-funnel, e.g. a second tab.)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return { ok: true, created: false };

  const validationError = validateCustomerInput({ email, password: input.password, fullName });
  if (validationError) return { ok: false, error: validationError };

  const admin = createAdminClient();
  const result = await createCustomerAccount(admin, {
    email,
    password: input.password,
    fullName,
    phone,
  });

  // --- Fresh account --------------------------------------------------------
  if (result.ok) {
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (signInErr) {
      return {
        ok: false,
        error: "Your account was created but we couldn't sign you in. Please sign in and try again.",
      };
    }
    return { ok: true, created: true };
  }

  if (!result.emailTaken) return { ok: false, error: result.error };

  // --- Email already has an account: try the password they typed ------------
  // Most returning customers reuse their password, so this usually signs them
  // straight in with no extra step.
  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (signInErr || !signIn.user) {
    return {
      ok: false,
      needsPassword: true,
      error: "You've booked with us before. Enter your account password to continue.",
    };
  }

  // Fill profile gaps from what they typed — never overwrite what's there.
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, phone")
    .eq("id", signIn.user.id)
    .maybeSingle();
  const gaps: Record<string, string> = {};
  if (!profile?.full_name && fullName) gaps.full_name = fullName;
  if (!profile?.phone && phone) gaps.phone = phone;
  if (Object.keys(gaps).length) {
    await admin.from("profiles").update(gaps).eq("id", signIn.user.id);
  }

  // Any guest bookings placed on this email since they signed up.
  await linkGuestBookings(signIn.user.id, email);

  return { ok: true, created: false };
}

export type PasswordResetResult = { ok: true } | { ok: false; error: string };

/**
 * Email a set-password link to a customer who's forgotten theirs. Reached from
 * the booking funnel's sign-in prompt and from /login.
 *
 * Same mechanism as the mechanic invite: we generate a recovery link and email
 * the token_hash through our own template rather than Supabase's mailer, so
 * /auth/callback can redeem it server-side and set the SSR cookies.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetResult> {
  const address = email.trim().toLowerCase();
  if (!address) return { ok: false, error: "Enter your email address first." };

  const admin = createAdminClient();
  const base = siteUrl();
  const next = "/dashboard/set-password";

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: address,
    options: { redirectTo: `${base}/auth/callback?next=${next}` },
  });

  // Don't confirm or deny that the address has an account.
  if (error || !data?.properties?.hashed_token) {
    if (error) console.error("Password reset link generation failed", error.message);
    return { ok: true };
  }

  const actionLink = `${base}/auth/callback?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=recovery&next=${next}`;

  try {
    const { subject, html } = await renderTemplateEmail("password_reset", {
      name: data.user?.user_metadata?.full_name ?? "there",
      action_link: actionLink,
    });
    await sendEmail({ to: address, subject, html });
  } catch (err) {
    console.error("Password reset email failed", err);
    return { ok: false, error: "We couldn't send the email. Please try again shortly." };
  }

  return { ok: true };
}
