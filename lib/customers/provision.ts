import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { linkGuestBookings } from "@/app/actions/link-guest-bookings";
import { generateReferralCode, normaliseReferralCode } from "@/lib/credits/referral-code";
import { grantCredit } from "@/lib/credits/credits";
import { REFERRAL_WELCOME_PENCE } from "@/lib/credits/constants";

// Shared customer account provisioning. Two callers:
//
//   - /signup           — the standalone "create an account" door.
//   - the booking flow  — every booking now creates (or signs into) an account
//                         before the pre-authorisation is taken, so the
//                         customer always lands on a dashboard that owns their
//                         job. See app/actions/booking-account.ts.
//
// Accounts are created with `email_confirm: true` so the customer gets a
// session immediately — the same approach used for mechanic/admin provisioning.
// There is no email round-trip to block the funnel.

type AdminClient = ReturnType<typeof createAdminClient>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export interface CreateCustomerInput {
  email: string;
  password: string;
  fullName: string;
  /** Snapshotted onto the profile so booking SMS can reach them. */
  phone?: string | null;
  /** Referral code from a share link, if they arrived via one. */
  referrerCode?: string | null;
}

export type CreateCustomerResult =
  | { ok: true; userId: string }
  /** `emailTaken` lets callers offer sign-in instead of failing outright. */
  | { ok: false; error: string; emailTaken?: boolean };

/**
 * Validate the fields every customer-account form collects. Returns an error
 * string for the form, or null when the input is usable.
 */
export function validateCustomerInput(input: {
  email: string;
  password: string;
  fullName: string;
}): string | null {
  if (!input.fullName.trim()) return "Enter your name.";
  if (!input.email || !EMAIL_RE.test(input.email))
    return "Enter a valid email address.";
  if (input.password.length < MIN_PASSWORD_LENGTH)
    return `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

/**
 * Create a customer auth user plus their profile, referral code, welcome credit
 * and any guest-booking links. Does NOT sign them in — callers set the session
 * cookies themselves (only they know where the customer should end up).
 */
export async function createCustomerAccount(
  admin: AdminClient,
  input: CreateCustomerInput,
): Promise<CreateCustomerResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = input.phone?.trim() || null;
  const referrerCode = normaliseReferralCode(input.referrerCode ?? "");

  const validationError = validateCustomerInput({
    email,
    password: input.password,
    fullName,
  });
  if (validationError) return { ok: false, error: validationError };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created.user) {
    const msg = createErr?.message ?? "Couldn't create your account.";
    if (msg.toLowerCase().includes("registered")) {
      return {
        ok: false,
        emailTaken: true,
        error: "An account with that email already exists — try signing in instead.",
      };
    }
    return { ok: false, error: msg };
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

  // Write the name, phone + a unique referral code onto the profile (the
  // handle_new_user trigger only seeds role + id reliably). Retry on the off
  // chance of a code collision.
  let ownCode = generateReferralCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        referral_code: ownCode,
        referred_by: referredBy,
      })
      .eq("id", userId);
    if (!error) break;
    // 23505 = unique_violation on referral_code — regenerate and retry.
    if (error.code === "23505") {
      ownCode = generateReferralCode();
      continue;
    }
    // Any other error: still set the name so the account is usable.
    await admin.from("profiles").update({ full_name: fullName, phone }).eq("id", userId);
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

  return { ok: true, userId };
}
