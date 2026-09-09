import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHourlyRatePence, getTakeRateBase } from "@/lib/pricing/calculate";
import { searchRepairCatalogue } from "@/lib/haynespro/catalogue";
import { loadQuote, loadQuotesForBooking, quoteMoney, type QuoteView } from "./load";
import { loadRevisionsForBooking, revisionMoney } from "@/lib/revisions/load";
import { safePriceQuoteLines, type QuoteLineInput } from "./pricing";
import { QUOTABLE_STATUSES, quoteExpiry, type QuoteKind } from "./status";
import { notifyCustomerQuoteSent, type QuoteBookingContact } from "./notify";

// The mechanic's side of quotes and faults (Task 33). Called only from the
// mechanic Server Actions (app/actions/job-quotes.ts, booking-faults.ts),
// which resolve the mechanic from the cookie session and pass their id in —
// the mechanic is never in the mobile app. Every write is service-role after
// an ownership re-read, as with every other mechanic action.

export type QuoteResult = { ok: true } | { ok: false; error: string };
export type QuoteCreateResult = { ok: true; id: string } | { ok: false; error: string };

const BOOKING_COLUMNS =
  "id, job_number, status, mechanic_id, customer_id, customer_email, customer_name, customer_phone, vehicle_reg, total_pence, credit_applied_pence, commission_rate";

type QuoteBooking = QuoteBookingContact & {
  status: string;
  vehicle_reg: string;
  total_pence: number | null;
  credit_applied_pence: number | null;
  commission_rate: number | null;
};

async function ownedBooking(bookingId: string, mechanicId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("bookings").select(BOOKING_COLUMNS).eq("id", bookingId).single();
  const booking = data as QuoteBooking | null;
  if (!booking) return { ok: false as const, error: "That job no longer exists." };
  if (booking.mechanic_id !== mechanicId) return { ok: false as const, error: "This isn't your job." };
  return { ok: true as const, booking, admin };
}

function revalidate(bookingId: string) {
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath(`/admin/jobs/${bookingId}`);
}

// --- Faults ------------------------------------------------------------------

export async function addFault(
  mechanicId: string,
  input: { bookingId: string; description: string; severity?: string },
): Promise<QuoteCreateResult> {
  const description = (input.description ?? "").trim().replace(/\s+/g, " ");
  if (!description) return { ok: false, error: "Describe the fault." };
  if (description.length > 500) return { ok: false, error: "Keep the fault under 500 characters." };
  const severity = input.severity === "urgent" ? "urgent" : "advisory";

  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  if (!["confirmed", "en_route", "in_progress"].includes(booking.status))
    return { ok: false, error: "Faults can only be added to an active job." };

  const { data, error } = await admin
    .from("booking_faults")
    .insert({ booking_id: booking.id, mechanic_id: mechanicId, description, severity })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't save the fault." };

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "fault_added",
    actor_id: mechanicId,
    actor_role: "mechanic",
    reason: description,
    payload: { fault_id: data.id, severity },
  });
  revalidate(booking.id);
  return { ok: true, id: data.id };
}

/** A mechanic can remove their own fault while the job is still active. */
export async function deleteFault(mechanicId: string, faultId: string): Promise<QuoteResult> {
  const admin = createAdminClient();
  const { data: fault } = await admin
    .from("booking_faults")
    .select("id, booking_id, mechanic_id, quote_id")
    .eq("id", faultId)
    .maybeSingle();
  if (!fault) return { ok: false, error: "That fault no longer exists." };
  if (fault.mechanic_id !== mechanicId) return { ok: false, error: "This isn't your fault note." };
  if (fault.quote_id) return { ok: false, error: "This fault has a quote against it — withdraw the quote first." };
  const { error } = await admin.from("booking_faults").delete().eq("id", faultId);
  if (error) return { ok: false, error: error.message };
  revalidate(fault.booking_id);
  return { ok: true };
}

// --- Quotes ------------------------------------------------------------------

export interface CreateQuoteInput {
  bookingId: string;
  kind: "now" | "follow_on";
  title?: string | null;
  note?: string | null;
  lines: QuoteLineInput[];
}

/**
 * Price and send a quote in one go. Part lines that name a catalogue part take
 * the catalogue's BMT price and name — the mechanic never sees supplier cost.
 */
export async function createQuote(mechanicId: string, input: CreateQuoteInput): Promise<QuoteCreateResult> {
  const kind: QuoteKind = input.kind === "follow_on" ? "follow_on" : "now";
  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  if (!QUOTABLE_STATUSES[kind].includes(booking.status))
    return {
      ok: false,
      error:
        kind === "now"
          ? "Extra work on this visit can only be quoted while the job is in progress."
          : "A return visit can be quoted while the job is in progress or once it's complete.",
    };

  // One open quote for this visit at a time — stacking approvals muddles the
  // customer and the capture. A revised job waiting on the customer (Task 37)
  // counts too: until they answer, the job it would add to isn't settled.
  if (kind === "now") {
    const existing = await loadQuotesForBooking(admin, booking.id);
    if (quoteMoney(existing).pendingNow)
      return { ok: false, error: "A quote is already waiting on the customer — withdraw it before sending another." };
    if (revisionMoney(await loadRevisionsForBooking(admin, booking.id)).pending)
      return { ok: false, error: "The revised job is still waiting on the customer — wait for their answer before quoting extra work." };
  }

  // Catalogue parts: name + BMT price from the table.
  const partIds = [...new Set(input.lines.map((l) => l.partId).filter((v): v is string => Boolean(v)))];
  const partsById = new Map<string, { name: string; bmt_price_pence: number }>();
  if (partIds.length) {
    const { data: parts } = await admin.from("parts").select("id, name, bmt_price_pence, is_active").in("id", partIds);
    for (const p of parts ?? []) if (p.is_active) partsById.set(p.id, { name: p.name, bmt_price_pence: p.bmt_price_pence });
  }
  const lines: QuoteLineInput[] = input.lines.map((l) => {
    if (l.kind === "part" && l.partId) {
      const part = partsById.get(l.partId);
      if (!part) return { ...l, partId: null };
      return { ...l, description: part.name, unitPence: part.bmt_price_pence };
    }
    return l;
  });

  const [hourlyRatePence, defaultRate] = await Promise.all([getHourlyRatePence(admin), getTakeRateBase(admin)]);
  const commissionRate = booking.commission_rate ?? defaultRate;
  const priced = safePriceQuoteLines(lines, { hourlyRatePence, commissionRate });
  if (!priced.ok) return priced;
  const { totals } = priced;

  const title = (input.title ?? "").trim().slice(0, 120) || null;
  const note = (input.note ?? "").trim().slice(0, 1000) || null;
  const now = new Date();
  const { data: quote, error } = await admin
    .from("job_quotes")
    .insert({
      booking_id: booking.id,
      mechanic_id: mechanicId,
      kind,
      status: "sent",
      title,
      note,
      hourly_rate_pence: hourlyRatePence,
      commission_rate: commissionRate,
      labour_pence: totals.labourPence,
      parts_pence: totals.partsPence,
      total_pence: totals.totalPence,
      platform_fee_pence: totals.platformFeePence,
      mechanic_payout_pence: totals.mechanicPayoutPence,
      sent_at: now.toISOString(),
      expires_at: quoteExpiry(now).toISOString(),
    })
    .select("id")
    .single();
  if (error || !quote) return { ok: false, error: error?.message ?? "Couldn't save the quote." };

  const { error: linesError } = await admin.from("job_quote_lines").insert(
    totals.lines.map((l) => ({
      quote_id: quote.id,
      position: l.position,
      kind: l.kind,
      description: l.description,
      hours: l.hours,
      quantity: l.quantity,
      unit_pence: l.unitPence,
      line_pence: l.linePence,
      node_id: l.nodeId,
      part_id: l.partId,
      fault_id: l.faultId,
    })),
  );
  if (linesError) {
    await admin.from("job_quotes").delete().eq("id", quote.id);
    return { ok: false, error: "We couldn't save the quote's lines. Please try again." };
  }
  // A fault quoted for points at its quote.
  const faultIds = [...new Set(totals.lines.map((l) => l.faultId).filter((v): v is string => Boolean(v)))];
  if (faultIds.length) {
    await admin.from("booking_faults").update({ quote_id: quote.id }).in("id", faultIds).eq("booking_id", booking.id);
  }

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "quote_sent",
    actor_id: mechanicId,
    actor_role: "mechanic",
    reason: title ?? (kind === "now" ? "Extra work on this visit" : "Return visit"),
    payload: { quote_id: quote.id, kind, total_pence: totals.totalPence, lines: totals.lines.length },
  });

  const view = await loadQuote(admin, quote.id);
  if (view) void notifyCustomerQuoteSent(booking, view);

  revalidate(booking.id);
  return { ok: true, id: quote.id };
}

export async function withdrawQuote(mechanicId: string, quoteId: string): Promise<QuoteResult> {
  const admin = createAdminClient();
  const quote = await loadQuote(admin, quoteId);
  if (!quote) return { ok: false, error: "That quote no longer exists." };
  if (quote.mechanicId !== mechanicId) return { ok: false, error: "This isn't your quote." };
  if (quote.status !== "sent") return { ok: false, error: "Only a quote that's waiting on the customer can be withdrawn." };

  // A hold the customer had started but not finished is released.
  if (quote.stripePaymentIntentId) await cancelIntentQuietly(quote.stripePaymentIntentId);

  const { error } = await admin
    .from("job_quotes")
    .update({ status: "withdrawn", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("status", "sent");
  if (error) return { ok: false, error: error.message };
  await admin.from("booking_faults").update({ quote_id: null }).eq("quote_id", quoteId);
  await admin.from("booking_events").insert({
    booking_id: quote.bookingId,
    event_type: "quote_withdrawn",
    actor_id: mechanicId,
    actor_role: "mechanic",
    payload: { quote_id: quoteId, total_pence: quote.totalPence },
  });
  revalidate(quote.bookingId);
  return { ok: true };
}

// --- Helpers for the builder ---------------------------------------------------

export interface RepairTimeHit {
  nodeId: string;
  description: string;
  hours: number;
  pricePence: number;
}

/**
 * The "automatic" in Gareth's quote tool: search this job's vehicle's repair
 * tree and hand back book times, so picking a job fills the hours in.
 */
export async function searchJobRepairTimes(
  mechanicId: string,
  bookingId: string,
  query: string,
): Promise<{ ok: true; hits: RepairTimeHit[]; truncated: boolean } | { ok: false; error: string }> {
  const owned = await ownedBooking(bookingId, mechanicId);
  if (!owned.ok) return owned;
  const q = query.trim();
  if (q.length < 3) return { ok: true, hits: [], truncated: false };
  const result = await searchRepairCatalogue(owned.booking.vehicle_reg, q, owned.admin);
  if (!result.ok) return { ok: false, error: result.message };
  return {
    ok: true,
    // Only a plain HaynesPro job carries a book time a quote line can cite;
    // combined repairs, categories and products are left out.
    hits: result.hits
      .filter((h) => h.kind === "repair" && !h.id.includes(":") && h.billedHours != null)
      .map((h) => ({ nodeId: h.id, description: h.description, hours: h.billedHours ?? 0, pricePence: h.pricePence ?? 0 })),
    truncated: result.truncated,
  };
}

export interface QuotePartOption {
  id: string;
  name: string;
  bmtPricePence: number;
}

/** Active catalogue parts, BMT price only — supplier cost never leaves the admin. */
export async function listQuoteParts(): Promise<QuotePartOption[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("parts")
    .select("id, name, bmt_price_pence")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, bmtPricePence: p.bmt_price_pence }));
}

async function cancelIntentQuietly(paymentIntentId: string): Promise<void> {
  try {
    const { stripe } = await import("@/lib/stripe/server");
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "canceled" && intent.status !== "succeeded") {
      await stripe.paymentIntents.cancel(paymentIntentId);
    }
  } catch {
    // No keys (dev), or already gone — nothing to release.
  }
}

export type { QuoteView };
