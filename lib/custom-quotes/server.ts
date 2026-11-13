import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHourlyRatePence, getTakeRateBase } from "@/lib/pricing/calculate";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  enforceRateLimits,
  type RateLimitRule,
} from "@/lib/rate-limit/limiter";
import type { RepairsQuote } from "@/lib/haynespro/repair-booking";
import {
  CUSTOM_QUOTE_COLUMNS,
  buildCustomQuote,
  cleanAdminQuote,
  cleanQuoteRequest,
  customQuoteRefusal,
  isOpenForAdmin,
  ownsCustomQuote,
  toCustomQuoteView,
  type AdminQuoteInput,
  type CustomQuoteRow,
  type CustomQuoteView,
  type QuoteCaller,
  type QuoteRequestInput,
} from "./model";
import {
  notifyAdminQuoteDeclined,
  notifyAdminQuoteRequested,
  notifyCustomerQuoteSent,
  notifyCustomerRequestReceived,
} from "./notify";

// Custom quotes (Task 75), the server half. Every write goes through the
// service-role client: the table has no write policies. Shared by the website's
// actions, the admin's actions and the mobile routes, so none of them can
// disagree about who may do what.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function loadCustomQuote(db: SupabaseClient, id: string): Promise<CustomQuoteRow | null> {
  if (!UUID_RE.test(id ?? "")) return null;
  try {
    const { data, error } = await db.from("custom_quotes").select(CUSTOM_QUOTE_COLUMNS).eq("id", id).maybeSingle();
    if (error) return null; // includes "relation does not exist" before 0089
    return (data as CustomQuoteRow | null) ?? null;
  } catch {
    return null;
  }
}

// --- Booking ------------------------------------------------------------------

export type CustomQuoteBooking =
  | { ok: true; quote: RepairsQuote; source: CustomQuoteRow }
  | { ok: false; error: string };

/**
 * A custom quote priced for booking by this caller, or null when `quoteId` is
 * not a custom quote at all (the funnel then tries a follow-on quote: both are
 * passed as `quoteId`, and a uuid is never both).
 */
export async function quoteCustomQuoteForBooking(
  quoteId: string,
  caller: QuoteCaller,
  db: SupabaseClient = createAdminClient(),
): Promise<CustomQuoteBooking | null> {
  const row = await loadCustomQuote(db, quoteId);
  if (!row) return null;
  if (!ownsCustomQuote(row, caller)) {
    return { ok: false, error: "This quote was sent to a different email address. Sign in with that one to book it." };
  }
  const refusal = customQuoteRefusal(row);
  if (refusal) return { ok: false, error: refusal };
  const [hourlyRatePence, commissionRate] = await Promise.all([getHourlyRatePence(db), getTakeRateBase(db)]);
  const quote = buildCustomQuote(row, { hourlyRatePence, commissionRate });
  if (!quote) return { ok: false, error: "This quote can't be booked. Please get in touch." };
  return { ok: true, quote, source: row };
}

/**
 * After the booking is written: the quote is booked, tied to the account that
 * booked it, and the job's timeline says where it came from. Never fails the
 * booking: the booking exists either way.
 */
export async function markCustomQuoteBooked(
  db: SupabaseClient,
  source: CustomQuoteRow,
  bookingId: string,
  customerId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from("custom_quotes")
    .update({
      status: "booked",
      booking_id: bookingId,
      customer_id: source.customer_id ?? customerId,
      responded_at: now,
      updated_at: now,
    })
    .eq("id", source.id);
  if (error) console.error("[custom-quotes] mark booked failed", source.id, error);
  // An existing event type on purpose: the apps read booking_events directly
  // and already know how to show a "quote_approved" line.
  await db.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "quote_approved",
    actor_id: customerId,
    actor_role: "customer",
    reason: "Booked from a custom quote",
    payload: { custom_quote_id: source.id, amount_pence: source.total_pence },
  });
}

// --- The customer -------------------------------------------------------------

/** The quote-request rate limits: per account when signed in, always per address. */
export async function enforceQuoteRequestLimits(who: { userId: string | null; ip: string }): Promise<string | null> {
  const rules: RateLimitRule[] = [
    { key: "mobile_quoterequest_ip_burst", subject: `ip:${who.ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_quoterequest_ip_daily", subject: `ip:${who.ip}`, windowSeconds: DAY_SECONDS },
  ];
  if (who.userId) {
    rules.unshift(
      { key: "mobile_quoterequest_user_burst", subject: `user:${who.userId}`, windowSeconds: MINUTE_SECONDS },
      { key: "mobile_quoterequest_user_daily", subject: `user:${who.userId}`, windowSeconds: DAY_SECONDS },
    );
  }
  const verdict = await enforceRateLimits(rules);
  return verdict.allowed ? null : "You've sent a few requests just now. Please wait a moment and try again.";
}

/**
 * A customer asks for a quote. A signed-in customer's request is tied to their
 * account and uses the account's email, so the quote can be booked from it.
 */
export async function requestCustomQuote(
  input: QuoteRequestInput,
  caller: QuoteCaller | null,
): Promise<Outcome<{ quoteId: string }>> {
  const cleaned = cleanQuoteRequest({
    ...input,
    email: caller?.email ?? input.email,
  });
  if (!cleaned.ok) return cleaned;
  const db = createAdminClient();
  const { data, error } = await db
    .from("custom_quotes")
    .insert({ ...cleaned.request, status: "requested", source: "customer", customer_id: caller?.userId ?? null })
    .select(CUSTOM_QUOTE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[custom-quotes] request insert failed", error);
    return { ok: false, error: "We couldn't send your request just now. Please try again in a moment." };
  }
  const row = data as CustomQuoteRow;
  void notifyAdminQuoteRequested(row);
  void notifyCustomerRequestReceived(row);
  return { ok: true, quoteId: row.id };
}

/** The customer says no: a request they no longer want, or a quote they won't book. */
export async function declineCustomQuote(quoteId: string, caller: QuoteCaller): Promise<Outcome> {
  const db = createAdminClient();
  const row = await loadCustomQuote(db, quoteId);
  if (!row || !ownsCustomQuote(row, caller)) return { ok: false, error: "We couldn't find that quote." };
  if (row.status !== "requested" && row.status !== "sent") {
    return { ok: false, error: customQuoteRefusal(row) ?? "This quote is already closed." };
  }
  const now = new Date().toISOString();
  const { error } = await db
    .from("custom_quotes")
    .update({ status: "declined", responded_at: now, updated_at: now, customer_id: row.customer_id ?? caller.userId })
    .eq("id", row.id)
    .in("status", ["requested", "sent"]);
  if (error) return { ok: false, error: "We couldn't update that quote just now. Please try again." };
  void notifyAdminQuoteDeclined(row);
  return { ok: true };
}

/** Every custom quote for this account: tied to it, or sent to its email. Newest first. */
export async function listCustomQuotesFor(caller: QuoteCaller): Promise<CustomQuoteView[]> {
  const db = createAdminClient();
  const email = caller.email?.trim().toLowerCase() ?? "";
  try {
    const query = db.from("custom_quotes").select(CUSTOM_QUOTE_COLUMNS).order("created_at", { ascending: false }).limit(50);
    const { data, error } = email
      ? await query.or(`customer_id.eq.${caller.userId},customer_email.eq.${email.replace(/[,()]/g, "")}`)
      : await query.eq("customer_id", caller.userId);
    if (error) return [];
    // The OR on email is a convenience; ownership is still checked row by row.
    return ((data ?? []) as CustomQuoteRow[]).filter((r) => ownsCustomQuote(r, caller)).map(toCustomQuoteView);
  } catch {
    return [];
  }
}

// --- The admin ----------------------------------------------------------------

/** The rate and commission a quote is booked at, fixed when it is sent. */
async function pricingSnapshot(db: SupabaseClient) {
  const [hourlyRatePence, commissionRate] = await Promise.all([getHourlyRatePence(db), getTakeRateBase(db)]);
  return { hourly_rate_pence: hourlyRatePence, commission_rate: commissionRate };
}

/**
 * Create (no `id`) or update an open quote, and optionally send it. Sending
 * snapshots the rate and commission and emails (and texts) the customer; a
 * quote already sent can be corrected and sent again.
 */
export async function saveCustomQuote(
  id: string | null,
  input: AdminQuoteInput,
  options: { send: boolean; adminId: string },
): Promise<Outcome<{ id: string }>> {
  const cleaned = cleanAdminQuote(input, options.send);
  if (!cleaned.ok) return cleaned;
  const db = createAdminClient();
  const now = new Date().toISOString();

  let existing: CustomQuoteRow | null = null;
  if (id) {
    existing = await loadCustomQuote(db, id);
    if (!existing) return { ok: false, error: "That quote no longer exists." };
    if (!isOpenForAdmin(existing.status)) return { ok: false, error: "This quote is closed and can't be changed." };
  }

  const values: Record<string, unknown> = { ...cleaned.quote, updated_at: now };
  if (options.send) {
    Object.assign(values, await pricingSnapshot(db), { status: "sent", sent_at: now });
  }

  const write = existing
    ? db.from("custom_quotes").update(values).eq("id", existing.id).in("status", ["requested", "sent"])
    : db.from("custom_quotes").insert({
        ...values,
        status: options.send ? "sent" : "requested",
        source: "admin",
        created_by: options.adminId,
      });
  const { data, error } = await write.select(CUSTOM_QUOTE_COLUMNS).single();
  if (error || !data) {
    console.error("[custom-quotes] save failed", error);
    return { ok: false, error: "Couldn't save the quote. Please try again." };
  }
  const row = data as CustomQuoteRow;
  if (options.send) void notifyCustomerQuoteSent(row);
  return { ok: true, id: row.id };
}

/** The admin cancels a request or a sent quote. The customer can't book it after this. */
export async function withdrawCustomQuote(id: string): Promise<Outcome> {
  const db = createAdminClient();
  const row = await loadCustomQuote(db, id);
  if (!row) return { ok: false, error: "That quote no longer exists." };
  if (!isOpenForAdmin(row.status)) return { ok: false, error: "This quote is already closed." };
  const { error } = await db
    .from("custom_quotes")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["requested", "sent"]);
  if (error) return { ok: false, error: "Couldn't withdraw the quote. Please try again." };
  return { ok: true };
}
