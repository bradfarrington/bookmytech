import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { quoteRepairs } from "@/lib/haynespro/repair-booking";
import { searchRepairCatalogue } from "@/lib/haynespro/catalogue";
import { dedupeRepairIds, MAX_REPAIRS_PER_BOOKING } from "@/lib/bookings/repair-ids";
import { cancelFeeTiers } from "@/lib/bookings/manage-booking";
import { getOnSiteDiagnosticFeePence } from "@/lib/pricing/calculate";
import { loadQuotesForBooking, quoteMoney } from "@/lib/quotes/load";
import { splitCommission } from "@/lib/quotes/pricing";
import { chargeIdOf, payoutToMechanic } from "@/lib/payments/payout";
import { formatJobNumber } from "@/lib/utils";
import type { BookingRepairRow } from "@/lib/bookings/repair-lines";
import { loadRevision, loadRevisionsForBooking, revisionMoney, type RevisionView } from "./load";
import { diffRevision, hasChanges, type RevisionDiff } from "./diff";
import {
  approvedExtras,
  partFromRow,
  snapshotFromBooking,
  snapshotFromQuote,
  type BookingPartRow,
  type RevisionPart,
  type RevisionSnapshot,
} from "./snapshot";
import { REVISABLE_STATUSES, revisionExpiry, type OnSiteCharge } from "./status";
import { feePayout, onSiteFeeFor, ON_SITE_FEE_LABEL } from "./fees";
import { notifyCustomerJobEndedOnSite, notifyCustomerRevisionSent, type RevisionBookingContact } from "./notify";

// The mechanic's side of a revision (Task 37). Called only from the mechanic
// Server Actions (app/actions/job-revisions.ts), which resolve the mechanic
// from the cookie session and pass their id in. Every write is service-role
// after an ownership re-read, as with every other mechanic action.

export type RevisionResult = { ok: true } | { ok: false; error: string };

const BOOKING_COLUMNS =
  "id, job_number, status, mechanic_id, customer_id, customer_email, customer_name, customer_phone, vehicle_reg, repair_node_id, repair_description, service_duration_hours, vehicle_raw_duration_hours, combine_source, engine_oil_litres, engine_oil_price_per_litre_pence, engine_oil_source, hourly_rate_pence, commission_rate, base_price_pence, parts_price_pence, total_pence, platform_fee_pence, mechanic_payout_pence, stripe_payment_intent_id, payment_mode";

type RevisionBooking = RevisionBookingContact & {
  status: string;
  vehicle_reg: string;
  repair_node_id: string | null;
  repair_description: string | null;
  service_duration_hours: number | string | null;
  vehicle_raw_duration_hours: number | string | null;
  combine_source: string | null;
  engine_oil_litres: number | string | null;
  engine_oil_price_per_litre_pence: number | null;
  engine_oil_source: string | null;
  hourly_rate_pence: number | null;
  commission_rate: number | string | null;
  base_price_pence: number | null;
  parts_price_pence: number | null;
  total_pence: number | null;
  platform_fee_pence: number | null;
  mechanic_payout_pence: number | null;
  stripe_payment_intent_id: string | null;
  payment_mode: string | null;
};

async function ownedBooking(bookingId: string, mechanicId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("bookings").select(BOOKING_COLUMNS).eq("id", bookingId).single();
  const booking = data as RevisionBooking | null;
  if (!booking) return { ok: false as const, error: "That job no longer exists." };
  if (booking.mechanic_id !== mechanicId) return { ok: false as const, error: "This isn't your job." };
  return { ok: true as const, booking, admin };
}

function revalidate(bookingId: string) {
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath("/mechanic/jobs");
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath(`/admin/jobs/${bookingId}`);
}

// --- Inputs -------------------------------------------------------------------

/** A part as the mechanic's panel sends it: one already on the booking, one from the catalogue, or typed. */
export interface RevisionPartInput {
  id?: string | null;
  partId?: string | null;
  name?: string | null;
  quantity?: number | null;
  unitPence?: number | null;
}

export interface RevisionInput {
  bookingId: string;
  repairIds: string[];
  parts: RevisionPartInput[];
}

export interface RevisionPreview {
  before: RevisionSnapshot;
  after: RevisionSnapshot;
  diff: RevisionDiff;
}

const MAX_PARTS = 20;

async function resolveParts(
  admin: ReturnType<typeof createAdminClient>,
  inputs: readonly RevisionPartInput[],
  existingRows: readonly BookingPartRow[],
): Promise<{ ok: true; parts: RevisionPart[] } | { ok: false; error: string }> {
  if (inputs.length > MAX_PARTS) return { ok: false, error: `A job can carry up to ${MAX_PARTS} parts.` };
  const existingById = new Map(existingRows.map((r) => [r.id, r]));
  const catalogueIds = [...new Set(inputs.map((p) => p.partId).filter((v): v is string => Boolean(v)))];
  const catalogue = new Map<string, { name: string; bmt_price_pence: number }>();
  if (catalogueIds.length) {
    const { data } = await admin.from("parts").select("id, name, bmt_price_pence, is_active").in("id", catalogueIds);
    for (const p of data ?? []) if (p.is_active) catalogue.set(p.id, { name: p.name, bmt_price_pence: p.bmt_price_pence });
  }
  const parts: RevisionPart[] = [];
  for (const input of inputs) {
    if (input.id) {
      // `existingRows` was loaded for this booking alone, so an unknown id is
      // a stale panel, not another job's part.
      const row = existingById.get(input.id);
      if (!row) return { ok: false, error: "One of those parts is no longer on this job — refresh the page." };
      parts.push(partFromRow(row));
      continue;
    }
    const quantity = Math.round(Number(input.quantity ?? 1));
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) return { ok: false, error: "Enter a quantity between 1 and 99 for each part." };
    if (input.partId) {
      const cat = catalogue.get(input.partId);
      if (!cat) return { ok: false, error: "One of those catalogue parts isn't available — pick another or type it in." };
      parts.push({ id: null, partId: input.partId, name: cat.name, quantity, unitPence: cat.bmt_price_pence, linePence: quantity * cat.bmt_price_pence, sourcing: "self" });
      continue;
    }
    const name = (input.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) return { ok: false, error: "Give each part a name." };
    if (name.length > 200) return { ok: false, error: "Keep each part's name under 200 characters." };
    const unitPence = Math.round(Number(input.unitPence));
    if (!Number.isFinite(unitPence) || unitPence < 0) return { ok: false, error: `Enter a price for "${name}".` };
    parts.push({ id: null, partId: null, name, quantity, unitPence, linePence: quantity * unitPence, sourcing: "self" });
  }
  return { ok: true, parts };
}

async function loadJobSheet(admin: ReturnType<typeof createAdminClient>, bookingId: string) {
  const [{ data: lineRows }, { data: partRows }, quotes, revisions] = await Promise.all([
    admin.from("booking_repairs").select("*").eq("booking_id", bookingId).order("position"),
    admin
      .from("booking_parts")
      .select("id, booking_id, part_id, part_name, quantity, unit_price_pence, total_pence, sourcing")
      .eq("booking_id", bookingId)
      .order("created_at"),
    loadQuotesForBooking(admin, bookingId),
    loadRevisionsForBooking(admin, bookingId),
  ]);
  return {
    lineRows: (lineRows ?? null) as BookingRepairRow[] | null,
    partRows: (partRows ?? []) as BookingPartRow[],
    quotes,
    revisions,
  };
}

async function buildPreview(
  admin: ReturnType<typeof createAdminClient>,
  booking: RevisionBooking,
  input: RevisionInput,
): Promise<{ ok: true; preview: RevisionPreview; sheet: Awaited<ReturnType<typeof loadJobSheet>> } | { ok: false; error: string }> {
  const repairIds = dedupeRepairIds(input.repairIds ?? []);
  if (repairIds.length === 0) return { ok: false, error: "Keep or add at least one repair — a job can't be empty. To end the job instead, use the options below once the customer has declined." };
  if (repairIds.length > MAX_REPAIRS_PER_BOOKING) return { ok: false, error: `A job can carry up to ${MAX_REPAIRS_PER_BOOKING} repairs.` };

  const sheet = await loadJobSheet(admin, booking.id);
  const parts = await resolveParts(admin, input.parts ?? [], sheet.partRows);
  if (!parts.ok) return parts;

  // Priced exactly as the checkout prices a basket for this car — at the
  // booking's snapshotted rate and commission, so a Pro-tier mechanic keeps
  // theirs and a platform rate change since booking doesn't reprice the job.
  const quote = await quoteRepairs(booking.vehicle_reg, repairIds, admin, {
    hourlyRatePence: booking.hourly_rate_pence ?? undefined,
    commissionRate: booking.commission_rate == null ? undefined : Number(booking.commission_rate),
  });
  if (!quote) return { ok: false, error: "One of those repairs can't be priced for this car — remove it and try again." };

  const money = revisionMoney(sheet.revisions);
  const before = snapshotFromBooking(booking, sheet.lineRows, sheet.partRows, approvedExtras(sheet.quotes, money.holdQuoteIds));
  const after = snapshotFromQuote(quote, parts.parts);
  return { ok: true, preview: { before, after, diff: diffRevision(before, after) }, sheet };
}

function revisableRefusal(status: string): string | null {
  return REVISABLE_STATUSES.includes(status) ? null : "The job can only be revised once you've arrived and started it.";
}

// --- Preview ------------------------------------------------------------------

export async function previewRevision(
  mechanicId: string,
  input: RevisionInput,
): Promise<{ ok: true; preview: RevisionPreview } | { ok: false; error: string }> {
  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const refusal = revisableRefusal(owned.booking.status);
  if (refusal) return { ok: false, error: refusal };
  const built = await buildPreview(owned.admin, owned.booking, input);
  if (!built.ok) return built;
  return { ok: true, preview: built.preview };
}

// --- Send ---------------------------------------------------------------------

export async function sendRevision(
  mechanicId: string,
  input: RevisionInput & { reason: string; note?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const reason = (input.reason ?? "").trim().replace(/\s+/g, " ");
  if (!reason) return { ok: false, error: "Tell the customer why the booked repair isn't right — they read it before approving." };
  if (reason.length > 500) return { ok: false, error: "Keep the reason under 500 characters." };
  const note = (input.note ?? "").trim().slice(0, 1000) || null;

  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  const refusal = revisableRefusal(booking.status);
  if (refusal) return { ok: false, error: refusal };

  const built = await buildPreview(admin, booking, input);
  if (!built.ok) return built;
  const { preview, sheet } = built;
  if (!hasChanges(preview.diff)) return { ok: false, error: "Nothing has changed — remove or add a repair or part first." };

  // One open ask per booking, and one approved revision per booking: a
  // second rewrite on top of an authorised difference has no safe capture
  // arithmetic, and in practice means "complete it and quote the rest".
  const money = revisionMoney(sheet.revisions);
  if (money.pending) return { ok: false, error: "A revised job is already waiting on the customer — withdraw it before sending another." };
  if (money.approved)
    return { ok: false, error: "This job has already been revised once and approved. Complete it, then send a follow-on quote for anything else." };
  if (quoteMoney(sheet.quotes).pendingNow)
    return { ok: false, error: "A quote for extra work is still waiting on the customer — withdraw it before revising the job." };

  const difference = preview.diff.differencePence;
  const now = new Date();
  const commissionRate = preview.after.commissionRate;

  // A positive difference is carried by a job_quotes row — born draft, so it
  // neither blocks completion nor counts as approved until the card is in.
  let holdQuoteId: string | null = null;
  if (difference > 0) {
    const split = splitCommission(difference, commissionRate);
    const { data: hold, error: holdError } = await admin
      .from("job_quotes")
      .insert({
        booking_id: booking.id,
        mechanic_id: mechanicId,
        kind: "now",
        status: "draft",
        title: "Revised job — difference",
        note: null,
        hourly_rate_pence: preview.after.hourlyRatePence,
        commission_rate: commissionRate,
        labour_pence: difference,
        parts_pence: 0,
        total_pence: difference,
        platform_fee_pence: split.platformFeePence,
        mechanic_payout_pence: split.mechanicPayoutPence,
      })
      .select("id")
      .single();
    if (holdError || !hold) return { ok: false, error: holdError?.message ?? "Couldn't prepare the payment for the difference." };
    holdQuoteId = hold.id;
    await admin.from("job_quote_lines").insert({
      quote_id: hold.id,
      position: 0,
      kind: "other",
      description: "Difference for the revised job",
      quantity: 1,
      unit_pence: difference,
      line_pence: difference,
    });
  }

  const { data: revision, error } = await admin
    .from("job_revisions")
    .insert({
      booking_id: booking.id,
      mechanic_id: mechanicId,
      status: "sent",
      reason,
      note,
      before: preview.before,
      after: preview.after,
      after_repair_ids: preview.after.repairIds,
      before_total_pence: preview.before.totalPence,
      after_total_pence: preview.after.totalPence,
      difference_pence: difference,
      hold_quote_id: holdQuoteId,
      sent_at: now.toISOString(),
      expires_at: revisionExpiry(now).toISOString(),
    })
    .select("id")
    .single();
  if (error || !revision) {
    if (holdQuoteId) await admin.from("job_quotes").delete().eq("id", holdQuoteId);
    return { ok: false, error: error?.message ?? "Couldn't save the revised job." };
  }

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "revision_sent",
    actor_id: mechanicId,
    actor_role: "mechanic",
    reason,
    payload: {
      revision_id: revision.id,
      before_total: preview.before.totalPence,
      after_total: preview.after.totalPence,
      difference_pence: difference,
      removed: preview.diff.lines.removed.map((l) => l.description).concat(preview.diff.parts.removed.map((p) => p.name)),
      added: preview.diff.lines.added.map((l) => l.description).concat(preview.diff.parts.added.map((p) => p.name)),
    },
  });

  const view = await loadRevision(admin, revision.id);
  if (view) void notifyCustomerRevisionSent(booking, view);
  revalidate(booking.id);
  return { ok: true, id: revision.id };
}

// --- Withdraw -----------------------------------------------------------------

export async function withdrawRevision(mechanicId: string, revisionId: string): Promise<RevisionResult> {
  const admin = createAdminClient();
  const revision = await loadRevision(admin, revisionId);
  if (!revision) return { ok: false, error: "That revised job no longer exists." };
  if (revision.mechanicId !== mechanicId) return { ok: false, error: "This isn't your job." };
  if (revision.status !== "sent") return { ok: false, error: "Only a revised job that's waiting on the customer can be withdrawn." };
  const now = new Date().toISOString();
  const { error } = await admin
    .from("job_revisions")
    .update({ status: "withdrawn", responded_at: now, updated_at: now })
    .eq("id", revisionId)
    .eq("status", "sent");
  if (error) return { ok: false, error: error.message };
  await withdrawHoldQuote(admin, revision);
  await admin.from("booking_events").insert({
    booking_id: revision.bookingId,
    event_type: "revision_withdrawn",
    actor_id: mechanicId,
    actor_role: "mechanic",
    payload: { revision_id: revisionId, difference_pence: revision.differencePence },
  });
  revalidate(revision.bookingId);
  return { ok: true };
}

/** Release the difference hold (draft or started) when a revision stops being open. */
export async function withdrawHoldQuote(admin: ReturnType<typeof createAdminClient>, revision: Pick<RevisionView, "holdQuoteId">): Promise<void> {
  if (!revision.holdQuoteId) return;
  const { data: quote } = await admin.from("job_quotes").select("id, status, stripe_payment_intent_id").eq("id", revision.holdQuoteId).maybeSingle();
  if (!quote || quote.status === "approved" || quote.status === "withdrawn") return;
  if (quote.stripe_payment_intent_id) await cancelIntentQuietly(quote.stripe_payment_intent_id);
  await admin
    .from("job_quotes")
    .update({ status: "withdrawn", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", quote.id)
    .in("status", ["draft", "sent"]);
}

// --- End the job on site ------------------------------------------------------

/**
 * The customer declined the revised job (or let it lapse) and the booked
 * work can't go ahead: end the job, charging the on-site diagnostic fee,
 * the en-route cancellation fee, or nothing. The fee is captured from the
 * base hold (the rest released) and paid out to the mechanic minus
 * commission, like any other charge. The booking becomes `cancelled` — no
 * new status for the app to learn — and the `cancelled` event says why.
 */
export async function endJobOnSite(
  mechanicId: string,
  input: { bookingId: string; charge: OnSiteCharge; note?: string | null },
): Promise<RevisionResult> {
  if (!["diagnostic", "cancellation", "none"].includes(input.charge)) return { ok: false, error: "Choose how to end the job." };
  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  if (booking.status !== "in_progress") return { ok: false, error: "This job has already moved on — refresh the page." };

  const revisions = await loadRevisionsForBooking(admin, booking.id);
  const money = revisionMoney(revisions);
  if (money.pending) return { ok: false, error: "The revised job is still waiting on the customer — wait for their answer or withdraw it." };
  if (!money.declined) return { ok: false, error: "The job can only be ended this way after the customer has declined a revised job." };
  const declined = money.declined;

  const [tiers, diagnosticPence] = await Promise.all([cancelFeeTiers(admin), getOnSiteDiagnosticFeePence(admin)]);
  const feePence = onSiteFeeFor(input.charge, { diagnosticPence, enRoutePence: tiers.enRoute });
  const feeLabel = ON_SITE_FEE_LABEL[input.charge];
  const note = (input.note ?? "").trim().slice(0, 500);
  const reason = note ? `${declined.reason} — ${note}` : declined.reason;

  // --- Settle the base hold: capture the fee, release the rest.
  let stripe: typeof import("@/lib/stripe/server").stripe | null = null;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    stripe = null;
  }
  let charged = 0;
  let chargeId: string | null = null;
  if (booking.stripe_payment_intent_id && stripe) {
    try {
      const current = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      if (current.status === "succeeded") {
        charged = current.amount_received;
        chargeId = chargeIdOf(current);
      } else if (current.status === "canceled") {
        charged = 0;
      } else if (feePence > 0) {
        const intent = await stripe.paymentIntents.capture(booking.stripe_payment_intent_id, {
          amount_to_capture: Math.min(feePence, current.amount),
        });
        charged = intent.amount_received;
        chargeId = chargeIdOf(intent);
      } else {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment error";
      return { ok: false, error: `Couldn't settle the customer's payment hold: ${message}. Nothing was changed — try again.` };
    }
  }

  // Any draft difference hold on the declined revision is released too.
  for (const r of revisions) await withdrawHoldQuote(admin, r);

  const { error } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancellation_reason: reason,
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
    })
    .eq("id", booking.id)
    .eq("mechanic_id", mechanicId)
    .eq("status", "in_progress");
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "cancelled",
    actor_id: mechanicId,
    actor_role: "mechanic",
    reason,
    payload: {
      status_from: "in_progress",
      status_to: "cancelled",
      cancelled_by: "mechanic",
      outcome: "customer_declined_revision",
      revision_id: declined.id,
      fee_kind: input.charge,
      fee_pence: charged,
    },
  });
  if (charged > 0) {
    await admin.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "payment_captured",
      actor_id: mechanicId,
      actor_role: "mechanic",
      payload: {
        amount_pence: charged,
        kind: input.charge === "diagnostic" ? "on_site_diagnostic" : "on_site_cancellation",
        revision_id: declined.id,
      },
    });
    // Paid out like any job: the fee minus the booking's commission.
    const gross = feePayout(charged, Number(booking.commission_rate ?? 0.15)).mechanicPayoutPence;
    await payoutToMechanic({
      admin,
      stripe,
      bookingId: booking.id,
      mechanicId,
      grossPence: gross,
      charges: chargeId ? [{ id: chargeId, capturedPence: charged }] : [],
      description: `Job ${formatJobNumber(booking.job_number)} ${feeLabel.toLowerCase()}`,
      actorId: mechanicId,
      actorRole: "mechanic",
    });
  } else if (feePence > 0) {
    await admin.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "note",
      actor_role: "system",
      payload: { note: `${feeLabel} of ${feePence}p could not be taken: there was no card hold to capture it from.`, amount_pence: feePence },
    });
  }

  void notifyCustomerJobEndedOnSite(booking, { feePence: charged, feeLabel, reason: declined.reason });
  revalidate(booking.id);
  return { ok: true };
}

// --- Catalogue search for the panel ------------------------------------------

export interface CatalogueHit {
  id: string;
  description: string;
  billedHours: number | null;
  pricePence: number | null;
  bundleName?: string;
  optionLabel?: string | null;
  fixedPrice?: boolean;
}

/** Search this job's car for anything bookable — plain jobs, combined-repair options and products alike. */
export async function searchJobCatalogue(
  mechanicId: string,
  bookingId: string,
  query: string,
): Promise<{ ok: true; hits: CatalogueHit[]; truncated: boolean } | { ok: false; error: string }> {
  const owned = await ownedBooking(bookingId, mechanicId);
  if (!owned.ok) return owned;
  const q = query.trim();
  if (q.length < 3) return { ok: true, hits: [], truncated: false };
  const result = await searchRepairCatalogue(owned.booking.vehicle_reg, q, owned.admin);
  if (!result.ok) return { ok: false, error: result.message };
  return {
    ok: true,
    hits: result.hits
      .filter((h) => h.kind === "repair")
      .map((h) => ({
        id: h.id,
        description: h.description,
        billedHours: h.billedHours,
        pricePence: h.pricePence,
        bundleName: h.bundleName,
        optionLabel: h.optionLabel,
        fixedPrice: (h as { fixedPrice?: true }).fixedPrice === true,
      })),
    truncated: result.truncated,
  };
}

async function cancelIntentQuietly(paymentIntentId: string): Promise<void> {
  try {
    const { stripe } = await import("@/lib/stripe/server");
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "canceled" && intent.status !== "succeeded") await stripe.paymentIntents.cancel(paymentIntentId);
  } catch {
    // No keys (dev), or already gone — nothing to release.
  }
}
