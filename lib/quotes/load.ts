import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteKind, QuoteStatus } from "./status";
import type { QuoteLineKind } from "./pricing";

// Reads quotes and faults for a booking into plain, serialisable views
// (Task 33). Every surface — the mechanic's job page, the customer's dashboard
// and approval page, the admin's job page, the mobile GET — goes through this.
// Fails open to [] before 0062 exists or on any error.

export interface QuoteLineView {
  id: string;
  position: number;
  kind: QuoteLineKind;
  description: string;
  hours: number | null;
  quantity: number;
  unitPence: number;
  linePence: number;
  nodeId: string | null;
  partId: string | null;
  faultId: string | null;
}

export interface QuoteView {
  id: string;
  bookingId: string;
  mechanicId: string;
  kind: QuoteKind;
  status: QuoteStatus;
  title: string | null;
  note: string | null;
  hourlyRatePence: number;
  commissionRate: number;
  labourPence: number;
  partsPence: number;
  totalPence: number;
  platformFeePence: number;
  mechanicPayoutPence: number;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  capturedAt: string | null;
  followOnBookingId: string | null;
  createdAt: string;
  lines: QuoteLineView[];
}

export interface FaultView {
  id: string;
  bookingId: string;
  mechanicId: string;
  description: string;
  severity: "advisory" | "urgent";
  quoteId: string | null;
  createdAt: string;
}

export const QUOTE_COLUMNS =
  "id, booking_id, mechanic_id, kind, status, title, note, hourly_rate_pence, commission_rate, labour_pence, parts_pence, total_pence, platform_fee_pence, mechanic_payout_pence, stripe_payment_intent_id, stripe_charge_id, sent_at, responded_at, expires_at, captured_at, follow_on_booking_id, created_at";
export const QUOTE_LINE_COLUMNS =
  "id, quote_id, position, kind, description, hours, quantity, unit_pence, line_pence, node_id, part_id, fault_id";

type QuoteRow = Record<string, unknown>;
type LineRow = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function toQuoteView(row: QuoteRow, lines: readonly LineRow[]): QuoteView {
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    mechanicId: String(row.mechanic_id),
    kind: row.kind as QuoteKind,
    status: row.status as QuoteStatus,
    title: str(row.title),
    note: str(row.note),
    hourlyRatePence: num(row.hourly_rate_pence),
    commissionRate: num(row.commission_rate, 0.15),
    labourPence: num(row.labour_pence),
    partsPence: num(row.parts_pence),
    totalPence: num(row.total_pence),
    platformFeePence: num(row.platform_fee_pence),
    mechanicPayoutPence: num(row.mechanic_payout_pence),
    stripePaymentIntentId: str(row.stripe_payment_intent_id),
    stripeChargeId: str(row.stripe_charge_id),
    sentAt: str(row.sent_at),
    respondedAt: str(row.responded_at),
    expiresAt: str(row.expires_at),
    capturedAt: str(row.captured_at),
    followOnBookingId: str(row.follow_on_booking_id),
    createdAt: String(row.created_at),
    lines: lines
      .filter((l) => l.quote_id === row.id)
      .map((l) => ({
        id: String(l.id),
        position: num(l.position),
        kind: l.kind as QuoteLineKind,
        description: String(l.description ?? ""),
        hours: l.hours == null ? null : num(l.hours),
        quantity: num(l.quantity, 1),
        unitPence: num(l.unit_pence),
        linePence: num(l.line_pence),
        nodeId: str(l.node_id),
        partId: str(l.part_id),
        faultId: str(l.fault_id),
      }))
      .sort((a, b) => a.position - b.position),
  };
}

/** Every quote on a booking, newest first, with lines. */
export async function loadQuotesForBooking(db: SupabaseClient, bookingId: string): Promise<QuoteView[]> {
  try {
    const { data: quotes, error } = await db
      .from("job_quotes")
      .select(QUOTE_COLUMNS)
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false });
    if (error || !quotes || quotes.length === 0) return [];
    const { data: lines } = await db
      .from("job_quote_lines")
      .select(QUOTE_LINE_COLUMNS)
      .in(
        "quote_id",
        quotes.map((q) => q.id),
      );
    return quotes.map((q) => toQuoteView(q as QuoteRow, (lines ?? []) as LineRow[]));
  } catch (err) {
    console.error("[quotes] load failed:", err);
    return [];
  }
}

/** One quote by id, with lines, or null. */
export async function loadQuote(db: SupabaseClient, quoteId: string): Promise<QuoteView | null> {
  try {
    const { data: quote } = await db.from("job_quotes").select(QUOTE_COLUMNS).eq("id", quoteId).maybeSingle();
    if (!quote) return null;
    const { data: lines } = await db.from("job_quote_lines").select(QUOTE_LINE_COLUMNS).eq("quote_id", quoteId);
    return toQuoteView(quote as QuoteRow, (lines ?? []) as LineRow[]);
  } catch (err) {
    console.error("[quotes] load failed:", err);
    return null;
  }
}

export async function loadFaultsForBooking(db: SupabaseClient, bookingId: string): Promise<FaultView[]> {
  try {
    const { data, error } = await db
      .from("booking_faults")
      .select("id, booking_id, mechanic_id, description, severity, quote_id, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.map((f) => ({
      id: f.id,
      bookingId: f.booking_id,
      mechanicId: f.mechanic_id,
      description: f.description,
      severity: f.severity === "urgent" ? "urgent" : "advisory",
      quoteId: f.quote_id ?? null,
      createdAt: f.created_at,
    }));
  } catch (err) {
    console.error("[faults] load failed:", err);
    return [];
  }
}

/** Approved `now` quotes still to be captured, and the sum of every approved reduction. */
export function quoteMoney(quotes: readonly QuoteView[]): {
  approvedNow: QuoteView[];
  approvedNowPence: number;
  reductionsPence: number;
  pendingNow: QuoteView | null;
} {
  const approvedNow = quotes.filter((q) => q.kind === "now" && q.status === "approved");
  return {
    approvedNow,
    approvedNowPence: approvedNow.reduce((s, q) => s + q.totalPence, 0),
    reductionsPence: quotes.filter((q) => q.kind === "reduction" && q.status === "approved").reduce((s, q) => s + -q.totalPence, 0),
    pendingNow: quotes.find((q) => q.kind === "now" && q.status === "sent") ?? null,
  };
}
