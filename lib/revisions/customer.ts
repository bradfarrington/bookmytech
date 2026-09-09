import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";
import { formatJobNumber } from "@/lib/utils";
import { loadQuote } from "@/lib/quotes/load";
import { loadRevision, loadRevisionsForBooking, type RevisionView } from "./load";
import { revisionRefusal } from "./status";
import { applyRevision } from "./apply";
import { withdrawHoldQuote } from "./mechanic";
import { notifyMechanicRevisionOutcome, type RevisionBookingContact } from "./notify";

// The customer's side of a revision (Task 37): see it, decline it, or approve
// it. Approving a DEARER job authorises a second hold for the difference —
// exactly Task 33's mechanism; approving a cheaper or same-priced one takes
// no payment and applies at once.
//
// Shared by the website (app/actions/customer-revisions.ts, cookie session)
// and the mobile app (app/api/mobile/v1/bookings/[id]/revisions/**, Bearer
// token). The caller is a parameter, decided by the trusted layer — the same
// rule as lib/bookings/manage-booking.ts, for the same reasons.

export type RevisionRespondResult =
  | { ok: true; outcome: "declined" }
  /** A dearer job: authorise this intent for the difference, then call confirmRevisionPaymentFor. */
  | { ok: true; outcome: "pay"; clientSecret: string; paymentIntentId: string; amountPence: number }
  /** Applied — nothing to pay now. */
  | { ok: true; outcome: "approved" }
  | { ok: false; error: string };

export type RevisionConfirmResult = { ok: true } | { ok: false; error: string };

const BOOKING_COLUMNS =
  "id, job_number, status, customer_id, customer_email, customer_name, customer_phone, mechanic_id, total_pence";

type RevisionBooking = RevisionBookingContact & { status: string; total_pence: number | null };

async function loadOwned(revisionId: string, caller: BookingCaller) {
  const admin = createAdminClient();
  const revision = await loadRevision(admin, revisionId);
  if (!revision) return { ok: false as const, error: "That revised job no longer exists." };
  const { data } = await admin.from("bookings").select(BOOKING_COLUMNS).eq("id", revision.bookingId).single();
  const booking = data as RevisionBooking | null;
  if (!booking) return { ok: false as const, error: "That booking no longer exists." };
  if (!ownsBooking(booking, caller)) return { ok: false as const, error: "This isn't your booking." };
  return { ok: true as const, revision, booking, admin };
}

function revalidate(bookingId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath(`/admin/jobs/${bookingId}`);
}

/** Every revision on a booking the caller owns. */
export async function listRevisionsFor(
  bookingId: string,
  caller: BookingCaller,
): Promise<{ ok: true; revisions: RevisionView[] } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: booking } = await admin.from("bookings").select("customer_id, customer_email").eq("id", bookingId).maybeSingle();
  if (!booking) return { ok: false, error: "That booking no longer exists." };
  if (!ownsBooking(booking, caller)) return { ok: false, error: "This isn't your booking." };
  return { ok: true, revisions: await loadRevisionsForBooking(admin, bookingId) };
}

/** One revision the caller owns, with its booking summary. */
export async function getRevisionFor(revisionId: string, caller: BookingCaller) {
  const owned = await loadOwned(revisionId, caller);
  if (!owned.ok) return owned;
  return { ok: true as const, revision: owned.revision, booking: owned.booking };
}

export async function respondToRevisionFor(
  revisionId: string,
  decision: "approve" | "decline",
  caller: BookingCaller,
): Promise<RevisionRespondResult> {
  const owned = await loadOwned(revisionId, caller);
  if (!owned.ok) return owned;
  const { revision, booking, admin } = owned;

  if (revision.status === "approved") return { ok: true, outcome: "approved" };
  const refusal = revisionRefusal(revision, booking.status);
  if (refusal) return { ok: false, error: refusal };

  if (decision === "decline") {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("job_revisions")
      .update({ status: "declined", responded_at: now, updated_at: now })
      .eq("id", revisionId)
      .eq("status", "sent");
    if (error) return { ok: false, error: error.message };
    await withdrawHoldQuote(admin, revision);
    await admin.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "revision_declined",
      actor_id: caller.userId,
      actor_role: "customer",
      payload: { revision_id: revisionId, difference_pence: revision.differencePence, after_total: revision.after.totalPence },
    });
    void notifyMechanicRevisionOutcome(booking, revision, "declined");
    revalidate(booking.id);
    return { ok: true, outcome: "declined" };
  }

  // Cheaper or the same: nothing to authorise — apply now.
  if (revision.differencePence <= 0 || !revision.holdQuoteId) {
    const applied = await applyRevision(admin, revision, { id: caller.userId, role: "customer" });
    if (!applied.ok) return applied;
    revalidate(booking.id);
    return { ok: true, outcome: "approved" };
  }

  // Dearer: a second manual-capture hold for the difference, carried by the
  // revision's hold quote. Reused if the customer started one and didn't
  // finish; created otherwise. Nothing changes until the card is authorised.
  const hold = await loadQuote(admin, revision.holdQuoteId);
  if (!hold || hold.status !== "draft") return { ok: false, error: "This revised job can't be approved right now — ask your mechanic to send it again." };
  let stripe;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return { ok: false, error: "Payments aren't available right now. Please try again shortly." };
  }
  try {
    if (hold.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(hold.stripePaymentIntentId);
      if (
        (existing.status === "requires_payment_method" || existing.status === "requires_confirmation" || existing.status === "requires_action" || existing.status === "requires_capture") &&
        existing.amount === revision.differencePence &&
        existing.client_secret
      ) {
        return { ok: true, outcome: "pay", clientSecret: existing.client_secret, paymentIntentId: existing.id, amountPence: revision.differencePence };
      }
    }
    const intent = await stripe.paymentIntents.create({
      amount: revision.differencePence,
      currency: "gbp",
      capture_method: "manual",
      payment_method_types: ["card"],
      description: `Book My Tech — revised job difference on job ${formatJobNumber(booking.job_number)}`,
      metadata: { customer_id: caller.userId, booking_id: booking.id, quote_id: hold.id, revision_id: revisionId },
    });
    if (!intent.client_secret) return { ok: false, error: "Couldn't start the payment. Please try again." };
    await admin.from("job_quotes").update({ stripe_payment_intent_id: intent.id, updated_at: new Date().toISOString() }).eq("id", hold.id);
    return { ok: true, outcome: "pay", clientSecret: intent.client_secret, paymentIntentId: intent.id, amountPence: revision.differencePence };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Payment error" };
  }
}

/**
 * The card has been authorised for the difference — prove it against Stripe,
 * approve the hold quote, and apply the revision. Idempotent.
 */
export async function confirmRevisionPaymentFor(
  revisionId: string,
  paymentIntentId: string,
  caller: BookingCaller,
): Promise<RevisionConfirmResult> {
  const owned = await loadOwned(revisionId, caller);
  if (!owned.ok) return owned;
  const { revision, booking, admin } = owned;
  if (!/^pi_[A-Za-z0-9_]{4,}$/.test(paymentIntentId)) return { ok: false, error: "We couldn't find that payment." };
  const hold = revision.holdQuoteId ? await loadQuote(admin, revision.holdQuoteId) : null;
  if (revision.status === "approved" && hold?.stripePaymentIntentId === paymentIntentId) return { ok: true };
  if (revision.differencePence <= 0 || !hold) return { ok: false, error: "This revised job doesn't take a payment." };
  const refusal = revisionRefusal(revision, booking.status);
  if (refusal) return { ok: false, error: refusal };

  let stripe;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return { ok: false, error: "Payments aren't available right now. Please try again shortly." };
  }
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return { ok: false, error: "We couldn't find that payment." };
  }
  if (intent.metadata?.revision_id !== revisionId || intent.metadata?.customer_id !== caller.userId)
    return { ok: false, error: "We couldn't find that payment." };
  if (intent.status !== "requires_capture") return { ok: false, error: "Your card hasn't been authorised yet — please try the payment again." };
  if (intent.amount !== revision.differencePence) return { ok: false, error: "That payment doesn't match the revised job. Please try again." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("job_quotes")
    .update({ status: "approved", stripe_payment_intent_id: intent.id, sent_at: now, responded_at: now, updated_at: now })
    .eq("id", hold.id)
    .in("status", ["draft", "sent"]);
  if (error) return { ok: false, error: error.message };

  const applied = await applyRevision(admin, revision, { id: caller.userId, role: "customer" }, { paymentIntentId: intent.id });
  if (!applied.ok) return applied;
  revalidate(booking.id);
  return { ok: true };
}
