import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHourlyRatePence, getTakeRateBase } from "@/lib/pricing/calculate";
import { searchRepairCatalogue } from "@/lib/haynespro/catalogue";
import { getRepairNodesByIds } from "@/lib/haynespro/tree";
import { resolveVehicle } from "@/lib/haynespro/vehicle";
import { partGroupsOnNodes } from "@/lib/parts/part-groups";
import { partGroupName, quoteJobParts, type PartsJob, type QuotedPart } from "@/lib/parts/quote-parts";
import { loadQuote, loadQuotesForBooking, quoteMoney, type QuoteView } from "./load";
import { loadRevisionsForBooking, revisionMoney } from "@/lib/revisions/load";
import { safePriceQuoteLines, type QuoteLineInput } from "./pricing";
import { QUOTABLE_STATUSES, quoteExpiry, type QuoteKind } from "./status";
import { notifyCustomerQuoteSent, type QuoteBookingContact } from "./notify";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";

// The mechanic's side of quotes and faults (Task 33). Called from the mechanic
// Server Actions (app/actions/job-quotes.ts, booking-faults.ts), which resolve
// the mechanic from the cookie session, and — quotes only — from the mechanic
// app's route handlers (app/api/mobile/v1/mechanic/…/quotes, Task 67), which
// resolve them from a bearer token. Either way the id is passed in. Every write
// is service-role after an ownership re-read, as with every other mechanic
// action.
//
// Every function refuses with a `code` (lib/mechanics/refusal.ts) for the
// routes to turn into a status; the website ignores it. Faults reached the app
// in Task 68.

export type QuoteWithdrawResult = { ok: true } | MechanicRefusal;
export type QuoteCreateResult = { ok: true; id: string } | MechanicRefusal;
export type QuotePreviewResult =
  | {
      ok: true;
      lines: Array<{ linePence: number }>;
      totalPence: number;
      platformFeePence: number;
      mechanicPayoutPence: number;
      hourlyRatePence: number;
    }
  | MechanicRefusal;

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
  if (!booking) return refuse("not_found", "That job no longer exists.");
  if (booking.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your job.");
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
  if (!description) return refuse("invalid", "Describe the fault.");
  if (description.length > 500) return refuse("invalid", "Keep the fault under 500 characters.");
  const severity = input.severity === "urgent" ? "urgent" : "advisory";

  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  if (!["confirmed", "en_route", "in_progress"].includes(booking.status))
    return refuse("conflict", "Faults can only be added to an active job.");

  const { data, error } = await admin
    .from("booking_faults")
    .insert({ booking_id: booking.id, mechanic_id: mechanicId, description, severity })
    .select("id")
    .single();
  if (error || !data) return refuse("failed", error?.message ?? "Couldn't save the fault.");

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
export async function deleteFault(mechanicId: string, faultId: string): Promise<QuoteWithdrawResult> {
  const admin = createAdminClient();
  const { data: fault } = await admin
    .from("booking_faults")
    .select("id, booking_id, mechanic_id, quote_id")
    .eq("id", faultId)
    .maybeSingle();
  if (!fault) return refuse("not_found", "That fault no longer exists.");
  if (fault.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your fault note.");
  if (fault.quote_id) return refuse("conflict", "This fault has a quote against it. Withdraw the quote first.");
  const { error } = await admin.from("booking_faults").delete().eq("id", faultId);
  if (error) return refuse("failed", error.message);
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
 * Price a quote's lines for a booking: the platform's hourly rate, and the
 * BOOKING's snapshotted commission (so a Pro-tier mechanic keeps theirs). The
 * one place both the preview and the real thing get their settings from.
 */
async function priceForBooking(
  admin: ReturnType<typeof createAdminClient>,
  booking: Pick<QuoteBooking, "commission_rate">,
  rawLines: unknown,
) {
  if (!Array.isArray(rawLines)) return refuse("invalid", "Add at least one line to the quote.");
  // A route handler passes JSON straight through, so make each line an object
  // and its two optional ids strings before the pricer reads them.
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  const lines: QuoteLineInput[] = rawLines.map((raw) => {
    const l = (raw && typeof raw === "object" ? raw : {}) as QuoteLineInput;
    return { ...l, description: text(l.description) ?? "", nodeId: text(l.nodeId), faultId: text(l.faultId), partId: null };
  });
  const [hourlyRatePence, defaultRate] = await Promise.all([getHourlyRatePence(admin), getTakeRateBase(admin)]);
  const commissionRate = booking.commission_rate ?? defaultRate;
  const priced = safePriceQuoteLines(lines, { hourlyRatePence, commissionRate });
  if (!priced.ok) return refuse("invalid", priced.error);
  return { ok: true as const, totals: priced.totals, hourlyRatePence, commissionRate };
}

/**
 * What a quote WOULD come to — nothing is saved. The mechanic app calls this as
 * the mechanic types, to show "Customer pays £90 · You earn £76.50" without
 * owning a copy of ./pricing.ts, the hourly rate or the commission.
 */
export async function previewQuote(mechanicId: string, bookingId: string, lines: unknown): Promise<QuotePreviewResult> {
  const owned = await ownedBooking(bookingId, mechanicId);
  if (!owned.ok) return owned;
  const priced = await priceForBooking(owned.admin, owned.booking, lines);
  if (!priced.ok) return priced;
  const { totals, hourlyRatePence } = priced;
  return {
    ok: true,
    lines: totals.lines.map((l) => ({ linePence: l.linePence })),
    totalPence: totals.totalPence,
    platformFeePence: totals.platformFeePence,
    mechanicPayoutPence: totals.mechanicPayoutPence,
    hourlyRatePence,
  };
}

/**
 * Price and send a quote in one go. Part lines are the mechanic's own: a name
 * and a price as typed, or filled in from an Alliance Automotive suggestion
 * (suggestQuoteParts). The frozen `parts` catalogue is no longer offered
 * (Task 43), so a line never names one.
 */
export async function createQuote(mechanicId: string, input: CreateQuoteInput): Promise<QuoteCreateResult> {
  const kind: QuoteKind = input.kind === "follow_on" ? "follow_on" : "now";
  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  if (!QUOTABLE_STATUSES[kind].includes(booking.status))
    return refuse(
      "conflict",
      kind === "now"
        ? "Extra work on this visit can only be quoted while the job is in progress."
        : "A return visit can be quoted while the job is in progress or once it's complete.",
    );

  // One open quote for this visit at a time — stacking approvals muddles the
  // customer and the capture. A revised job waiting on the customer (Task 37)
  // counts too: until they answer, the job it would add to isn't settled.
  if (kind === "now") {
    const existing = await loadQuotesForBooking(admin, booking.id);
    if (quoteMoney(existing).pendingNow)
      return refuse("conflict", "A quote is already waiting on the customer. Withdraw it before sending another.");
    if (revisionMoney(await loadRevisionsForBooking(admin, booking.id)).pending)
      return refuse("conflict", "The revised job is still waiting on the customer. Wait for their answer before quoting extra work.");
  }

  const priced = await priceForBooking(admin, booking, input.lines);
  if (!priced.ok) return priced;
  const { totals, hourlyRatePence, commissionRate } = priced;

  // "Quote for this" on a fault: the line names it (`job_quote_lines.fault_id`)
  // and the fault points back at the quote. Only a fault noted on THIS job.
  const quotedFaultIds = [...new Set(totals.lines.map((l) => l.faultId).filter((v): v is string => Boolean(v)))];
  if (quotedFaultIds.length) {
    const { data: known } = await admin.from("booking_faults").select("id").eq("booking_id", booking.id).in("id", quotedFaultIds);
    if ((known ?? []).length !== quotedFaultIds.length)
      return refuse("conflict", "One of the faults on this quote is no longer on the job. Refresh and try again.");
  }

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
  if (error || !quote) return refuse("failed", error?.message ?? "Couldn't save the quote.");

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
    return refuse("conflict", "We couldn't save the quote's lines. Please try again.");
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

export async function withdrawQuote(mechanicId: string, quoteId: string): Promise<QuoteWithdrawResult> {
  const admin = createAdminClient();
  const quote = await loadQuote(admin, quoteId);
  if (!quote) return refuse("not_found", "That quote no longer exists.");
  if (quote.mechanicId !== mechanicId) return refuse("forbidden", "This isn't your quote.");
  if (quote.status !== "sent") return refuse("conflict", "Only a quote that's waiting on the customer can be withdrawn.");

  // A hold the customer had started but not finished is released.
  if (quote.stripePaymentIntentId) await cancelIntentQuietly(quote.stripePaymentIntentId);

  const { error } = await admin
    .from("job_quotes")
    .update({ status: "withdrawn", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("status", "sent");
  if (error) return refuse("failed", error.message);
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
): Promise<{ ok: true; hits: RepairTimeHit[]; truncated: boolean } | MechanicRefusal> {
  const owned = await ownedBooking(bookingId, mechanicId);
  if (!owned.ok) return owned;
  const q = query.trim();
  if (q.length < 3) return { ok: true, hits: [], truncated: false };
  const result = await searchRepairCatalogue(owned.booking.vehicle_reg, q, owned.admin);
  // The catalogue's own sentence ("We couldn't look up repairs for this
  // vehicle…") — written for whoever is searching, so it goes through.
  if (!result.ok) return refuse("conflict", result.message);
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

export interface QuotePartSuggestion {
  key: string;
  /** The labour line's HaynesPro job it belongs to. */
  nodeId: string;
  /** "Brake pads (rear) · BREMBO · BREP59038": what the part line is called. */
  description: string;
  quantity: number;
  /** What the customer pays per unit: AAG's price with no mark-up, or the admin's set price. */
  unitPence: number;
  source: QuotedPart["source"];
}

const MAX_SUGGESTION_JOBS = 10;

/**
 * The parts the labour on a quote needs, priced for this job's car exactly as
 * a customer booking prices them (Task 43): HaynesPro's part groups for each
 * job, Alliance Automotive's best-rated part (or the admin's choice or set
 * price), one per axle when a job names neither. The mechanic adds the ones
 * they want as ordinary part lines. `missing` names the groups with no price.
 */
export async function suggestQuoteParts(
  mechanicId: string,
  bookingId: string,
  nodeIds: readonly string[],
): Promise<{ ok: true; parts: QuotePartSuggestion[]; missing: string[] } | { ok: false; error: string }> {
  const owned = await ownedBooking(bookingId, mechanicId);
  if (!owned.ok) return owned;
  const ids = [...new Set(nodeIds.map((id) => String(id ?? "").trim()).filter((id) => id && !id.includes(":")))].slice(
    0,
    MAX_SUGGESTION_JOBS,
  );
  if (ids.length === 0) return { ok: true, parts: [], missing: [] };

  const vehicle = await resolveVehicle(owned.booking.vehicle_reg, owned.admin);
  if (!vehicle || vehicle.repairtimeTypeId == null) {
    return { ok: false, error: "We couldn't look up parts for this car. Add them yourself." };
  }
  const nodes = await getRepairNodesByIds({ carTypeId: vehicle.carTypeId, repairtimeTypeId: vehicle.repairtimeTypeId }, ids);
  const byId = new Map(nodes.filter((n) => n.id != null).map((n) => [n.id as string, n]));
  const jobs: PartsJob[] = ids.flatMap((id) => {
    const node = byId.get(id) ?? (ids.length === 1 && nodes.length === 1 ? nodes[0] : undefined);
    if (!node) return [];
    return [
      {
        nodeId: id,
        description: node.description?.trim() ?? "",
        groups: partGroupsOnNodes([node]).map((g) => ({ genartId: g.genartId, label: g.description || `Part group ${g.genartId}` })),
      },
    ];
  });

  const priced = await quoteJobParts({ db: owned.admin, reg: owned.booking.vehicle_reg, carTypeId: vehicle.carTypeId, jobs });
  return {
    ok: true,
    parts: priced.parts.map((part, index) => ({
      key: `${part.nodeId}:${part.genartId}:${part.position ?? "any"}:${index}`,
      nodeId: part.nodeId,
      description: [partGroupName(part), part.brand, part.partNumber].filter(Boolean).join(" · ").slice(0, 200),
      quantity: part.quantity,
      unitPence: part.unitPence,
      source: part.source,
    })),
    missing: priced.ok ? [] : [...new Set(priced.missing.map((m) => m.label))],
  };
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
