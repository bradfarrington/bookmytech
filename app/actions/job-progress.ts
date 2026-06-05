"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { formatPrice, siteUrl } from "@/lib/utils";
import { completedBookingCount, grantCredit } from "@/lib/credits/credits";
import { REFERRAL_BONUS_PENCE } from "@/lib/credits/constants";

export type JobProgressResult = { ok: true } | { ok: false; error: string };

// Live job-lifecycle actions for the desktop job-detail view.
//
// Task 06 originally planned start-journey / arrival / completion for the mobile
// PWA, but the booking status enum and lifecycle timestamps (en_route_at,
// started_at, completed_at) already exist (0004), so the mechanic can drive the
// same transitions from the desktop dashboard. GPS live-location tracking stays
// deferred to the mobile app — this is just the status flag the customer's
// tracker reads.
//
// Same trust model as mechanic-jobs.ts / job-offers.ts: mechanics have no
// UPDATE rights on bookings under RLS, so we verify the caller owns the job in
// an RLS-aware client, re-read + re-check status under the service-role client,
// then mutate. Each action only fires from one specific status, so a stale page
// can't skip a step or double-fire.

async function requireMechanic() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "mechanic")
    return { ok: false as const, error: "Mechanics only." };
  return { ok: true as const, mechanicId: user.id };
}

// Shared guard + transition. `from` is the only status the action is valid
// from; `to` is the new status; `stamp` is the lifecycle timestamp column to
// set to now(). Returns the mechanic id on success so callers can audit.
async function transition(
  bookingId: string,
  from: string,
  to: string,
  stamp: "en_route_at" | "started_at" | "completed_at",
) {
  const guard = await requireMechanic();
  if (!guard.ok) return { ...guard, booking: null, admin: null };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, customer_email, customer_name")
    .eq("id", bookingId)
    .single();

  if (!booking)
    return { ok: false as const, error: "That job no longer exists.", booking: null, admin: null };
  if (booking.mechanic_id !== guard.mechanicId)
    return { ok: false as const, error: "This isn't your job.", booking: null, admin: null };
  if (booking.status !== from)
    return {
      ok: false as const,
      error: "This job has already moved on — refresh the page.",
      booking: null,
      admin: null,
    };

  const { error } = await admin
    .from("bookings")
    .update({ status: to, [stamp]: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("mechanic_id", guard.mechanicId)
    .eq("status", from);
  if (error)
    return { ok: false as const, error: error.message, booking: null, admin: null };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "status_changed",
    actor_id: guard.mechanicId,
    actor_role: "mechanic",
    payload: { status_from: from, status_to: to },
  });

  return { ok: true as const, mechanicId: guard.mechanicId, booking, admin };
}

function revalidate(bookingId: string) {
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  // The customer's tracker reads the same booking by id.
  revalidatePath(`/book/confirmed/${bookingId}`);
}

/** confirmed → en_route. Stamps en_route_at and tells the customer you're on the way. */
export async function startJourney(bookingId: string): Promise<JobProgressResult> {
  const res = await transition(bookingId, "confirmed", "en_route", "en_route_at");
  if (!res.ok) return res;

  const { booking } = res;
  if (booking.customer_email) {
    sendEmail({
      to: booking.customer_email,
      subject: "Your mechanic is on the way",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a8a;">Your mechanic is on the way</h1>
          <p>Hi ${booking.customer_name ?? "there"},</p>
          <p>Your mechanic has set off and is heading to you now. Please make sure
          your vehicle is accessible.</p>
          <p style="color: #64748b; font-size: 14px;">Track your booking from your
          confirmation page for live status updates.</p>
        </div>
      `,
    }).catch(console.error);
  }

  revalidate(bookingId);
  return { ok: true };
}

/** en_route → in_progress. Stamps started_at. */
export async function beginWork(bookingId: string): Promise<JobProgressResult> {
  const res = await transition(bookingId, "en_route", "in_progress", "started_at");
  if (!res.ok) return res;
  revalidate(bookingId);
  return { ok: true };
}

/**
 * in_progress → completed. Captures the Stripe pre-authorisation (manual capture
 * from booking creation), stamps completed_at, and sends the customer a receipt.
 *
 * Capture failure is fatal: we do NOT mark the job complete if the money didn't
 * move, so the mechanic can retry. If Stripe isn't configured at all (local dev
 * without keys) we complete without capturing — mirroring create-booking's
 * graceful degradation.
 */
export async function completeAndCharge(bookingId: string): Promise<JobProgressResult> {
  // Guard + ownership + status, but DON'T flip status yet — capture first so a
  // failed charge leaves the job in_progress and retryable.
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, status, mechanic_id, customer_id, customer_email, customer_name, total_pence,
       mechanic_payout_pence, credit_applied_pence, payment_mode,
       stripe_payment_intent_id, stripe_payment_method_id, stripe_customer_id,
       service:services(name), mechanic:mechanics(stripe_account_id)`,
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That job no longer exists." };
  if (booking.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your job." };
  if (booking.status !== "in_progress")
    return { ok: false, error: "This job has already moved on — refresh the page." };

  // Sign-off gate: a job can't be completed (and charged) until the customer
  // has signed on the mechanic's screen — see saveSignature in job-media.ts.
  const { count: sigCount } = await admin
    .from("booking_media")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("kind", "signature");
  if (!sigCount)
    return { ok: false, error: "Get the customer to sign off before completing the job." };

  // --- Capture the pre-authorisation ---------------------------------------
  let captured = false;
  // The charge created by the capture; used as the transfer's source_transaction
  // so Stripe releases the mechanic's payout from these exact funds as they
  // settle — no need for the platform balance to be topped up manually.
  let chargeId: string | null = null;
  // Hoisted so the same client drives the payout transfer below.
  let stripe: typeof import("@/lib/stripe/server").stripe | null = null;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    // No STRIPE_SECRET_KEY (dev) — proceed without capturing or transferring.
    stripe = null;
  }
  // What the customer actually owes = total minus any account credit applied.
  const chargePence = Math.max(0, (booking.total_pence ?? 0) - (booking.credit_applied_pence ?? 0));

  if (stripe && booking.payment_mode === "deferred") {
    // Trusted-Customer deferred flow: no hold was placed — charge the saved card
    // now (off-session). chargePence can be 0 if credit covered the rest.
    if (booking.stripe_payment_method_id && chargePence > 0) {
      try {
        const intent = await stripe.paymentIntents.create({
          amount: chargePence,
          currency: "gbp",
          customer: booking.stripe_customer_id ?? undefined,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: "Book My Tech — service charge",
          metadata: { booking_id: bookingId },
        });
        if (intent.status !== "succeeded") {
          return {
            ok: false,
            error: "Couldn't charge the saved card. The job stays open — try again.",
          };
        }
        captured = true;
        chargeId =
          typeof intent.latest_charge === "string"
            ? intent.latest_charge
            : (intent.latest_charge?.id ?? null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stripe charge failed";
        return { ok: false, error: `Couldn't take payment: ${message}. The job stays open — try again.` };
      }
    }
  } else if (booking.stripe_payment_intent_id && stripe) {
    // Pre-auth flow: capture the manual hold (its amount is already total − credit).
    try {
      const intent = await stripe.paymentIntents.capture(booking.stripe_payment_intent_id);
      captured = true;
      chargeId =
        typeof intent.latest_charge === "string"
          ? intent.latest_charge
          : (intent.latest_charge?.id ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe capture failed";
      return { ok: false, error: `Couldn't take payment: ${message}. The job stays open — try again.` };
    }
  }
  // 'free' bookings (credit covered the whole total) capture nothing.

  // --- Flip to completed (only after a successful / skipped capture) --------
  const { error } = await admin
    .from("bookings")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("mechanic_id", guard.mechanicId)
    .eq("status", "in_progress");
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "status_changed",
    actor_id: guard.mechanicId,
    actor_role: "mechanic",
    payload: { status_from: "in_progress", status_to: "completed" },
  });
  if (captured) {
    await admin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "payment_captured",
      actor_id: guard.mechanicId,
      actor_role: "mechanic",
      payload: { amount_pence: chargePence, credit_applied_pence: booking.credit_applied_pence ?? 0 },
    });
  }

  // --- Referral bonus -------------------------------------------------------
  // If this is the customer's first completed booking and they joined via a
  // referral, reward the referrer with credit. Gated on first-completion so it
  // fires exactly once per referee (completeAndCharge can't re-run once the job
  // is 'completed').
  if (booking.customer_id) {
    try {
      const completed = await completedBookingCount(admin, booking.customer_id);
      if (completed === 1) {
        const { data: prof } = await admin
          .from("profiles")
          .select("referred_by")
          .eq("id", booking.customer_id)
          .single();
        if (prof?.referred_by) {
          await grantCredit(
            admin,
            prof.referred_by,
            REFERRAL_BONUS_PENCE,
            "referral_bonus",
            "Your friend completed their first booking",
          );
        }
      }
    } catch (err) {
      console.error("Referral bonus failed for booking", bookingId, err);
    }
  }

  // --- Pay the mechanic (Stripe Connect transfer) --------------------------
  // After capturing the customer's payment on the platform account, transfer
  // the mechanic's snapshotted share to their connected account; the platform
  // retains the fee. The transfer goes to whoever currently holds the job, so a
  // replacement mechanic is paid correctly. A failed transfer is NON-fatal —
  // the money is already captured and the job is complete — so we log it for
  // reconciliation/retry rather than blocking sign-off.
  const mechanicAccount = (
    Array.isArray(booking.mechanic) ? booking.mechanic[0] : booking.mechanic
  ) as { stripe_account_id: string | null } | null;
  const payoutPence = booking.mechanic_payout_pence ?? 0;
  // Pay the mechanic when we captured money, or when credit covered the whole
  // total ('free') — in the free case there's no source_transaction, so the
  // payout draws from the platform balance (which funded the credit).
  const shouldPay = payoutPence > 0 && (captured || booking.payment_mode === "free");
  if (shouldPay && stripe && mechanicAccount?.stripe_account_id) {
    try {
      const transfer = await stripe.transfers.create({
        amount: payoutPence,
        currency: "gbp",
        destination: mechanicAccount.stripe_account_id,
        // Release the payout from the funds of this booking's own charge as they
        // settle — keeps payouts automatic without managing the platform balance.
        ...(chargeId ? { source_transaction: chargeId } : {}),
        transfer_group: bookingId,
        metadata: { booking_id: bookingId, mechanic_id: guard.mechanicId },
      });
      await admin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "payout_transferred",
        actor_id: guard.mechanicId,
        actor_role: "mechanic",
        payload: { amount_pence: payoutPence, transfer_id: transfer.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "transfer failed";
      console.error("Mechanic payout transfer failed for booking", bookingId, message);
      await admin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "note",
        actor_id: guard.mechanicId,
        actor_role: "mechanic",
        payload: { note: `Payout transfer failed: ${message}`, amount_pence: payoutPence },
      });
    }
  }

  // --- Receipt email --------------------------------------------------------
  const serviceName =
    (Array.isArray(booking.service) ? booking.service[0]?.name : (booking.service as { name?: string } | null)?.name) ??
    "your service";
  if (booking.customer_email) {
    // One-tap rating links: each star deep-links into the review form with the
    // rating pre-selected (?rating=N).
    const reviewUrl = `${siteUrl()}/review/${bookingId}`;
    const starLinks = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<a href="${reviewUrl}?rating=${n}" style="text-decoration:none;font-size:28px;color:#f59e0b;">★</a>`,
      )
      .join("&nbsp;");
    sendEmail({
      to: booking.customer_email,
      subject: "Your job is complete — receipt",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a8a;">All done — thanks for using Book My Tech</h1>
          <p>Hi ${booking.customer_name ?? "there"},</p>
          <p>Your mechanic has marked <strong>${serviceName}</strong> complete.</p>
          ${
            (booking.credit_applied_pence ?? 0) > 0
              ? `<p style="color: #64748b; font-size: 14px; margin: 0;">Service total ${formatPrice(booking.total_pence ?? 0)} · account credit −${formatPrice(booking.credit_applied_pence ?? 0)}</p>`
              : ""
          }
          <p style="font-size: 18px; font-weight: 600; color: #1e3a8a;">
            ${chargePence > 0 ? `Total charged: ${formatPrice(chargePence)}` : "Paid in full with your account credit — nothing to pay"}
          </p>
          <p style="color: #64748b; font-size: 14px;">${
            chargePence === 0
              ? "Your account credit covered this booking."
              : captured
                ? "Your card has now been charged."
                : "Payment will be settled shortly."
          }</p>
          <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border-radius: 12px; text-align: center;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #0f172a;">How did your mechanic do?</p>
            <p style="margin: 0 0 12px;">${starLinks}</p>
            <a href="${reviewUrl}" style="color: #2563eb; font-size: 14px; font-weight: 600;">Leave a review</a>
          </div>
        </div>
      `,
    }).catch(console.error);
  }

  // --- Proactive service reminders ------------------------------------------
  // Seed this car's future reminders (MOT due, annual service, seasonal, brake
  // follow-up) now that the job is done. Best-effort — the daily scheduler cron
  // also back-fills, and a reminder hiccup must never fail completion.
  try {
    const { scheduleRemindersForBooking, REMINDER_BOOKING_SELECT } = await import(
      "@/lib/reminders/schedule-booking"
    );
    const { data: full } = await admin
      .from("bookings")
      .select(REMINDER_BOOKING_SELECT)
      .eq("id", bookingId)
      .single();
    if (full) await scheduleRemindersForBooking(full, admin);
  } catch (err) {
    console.error("Failed to schedule reminders for", bookingId, err);
  }

  revalidate(bookingId);
  return { ok: true };
}
