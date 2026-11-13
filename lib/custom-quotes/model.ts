// Custom quotes (Task 75): the jobs the catalogue doesn't list, priced by the
// admin as ONE total and booked through the ordinary funnel. Pure (no I/O), so
// the rules — what can be booked, by whom, at what price — are unit-tested and
// shared by the website, the admin and the mobile API.
//
// Owner decisions (Brad, 2026-11-13): customers can ask from the site or app;
// approving goes straight to booking; one total, like every other price;
// offered to every mechanic; open until either side cancels (no expiry).

import { computePrice } from "@/lib/pricing/calculate";
import type { RepairsQuote } from "@/lib/haynespro/repair-booking";

export type CustomQuoteStatus = "requested" | "sent" | "booked" | "declined" | "withdrawn";

export interface CustomQuoteRow {
  id: string;
  status: CustomQuoteStatus;
  source: "customer" | "admin";
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  vehicle_reg: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  postcode: string | null;
  request_text: string | null;
  title: string | null;
  details: string | null;
  total_pence: number | null;
  /** numeric arrives as a string from PostgREST. */
  visit_hours: number | string;
  hourly_rate_pence: number | null;
  commission_rate: number | string | null;
  sent_at: string | null;
  responded_at: string | null;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
}

export const CUSTOM_QUOTE_COLUMNS =
  "id, status, source, customer_id, customer_name, customer_email, customer_phone, vehicle_reg, vehicle_make, vehicle_model, postcode, request_text, title, details, total_pence, visit_hours, hourly_rate_pence, commission_rate, sent_at, responded_at, booking_id, created_at, updated_at";

/** What a customer reads for each status. */
export const CUSTOM_QUOTE_STATUS_LABEL: Record<CustomQuoteStatus, string> = {
  requested: "We're pricing it",
  sent: "Ready to book",
  booked: "Booked",
  declined: "Declined",
  withdrawn: "Cancelled",
};

/** What the admin reads for each status. */
export const CUSTOM_QUOTE_ADMIN_LABEL: Record<CustomQuoteStatus, string> = {
  requested: "To price",
  sent: "Sent",
  booked: "Booked",
  declined: "Declined by customer",
  withdrawn: "Withdrawn",
};

export const CUSTOM_QUOTE_LIMITS = {
  name: 120,
  phone: 40,
  reg: 16,
  make: 60,
  model: 80,
  postcode: 10,
  request: 2000,
  title: 120,
  details: 2000,
  /** £20,000: nobody types more than that for a mobile job by accident. */
  maxTotalPence: 2_000_000,
  maxVisitHours: 24,
} as const;

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const s = value.trim().replace(/[ \t]+/g, " ");
  return s ? s.slice(0, max) : null;
};

/** "ab12 cde" → "AB12CDE", the way every other reg in the system is stored. */
export function normaliseQuoteReg(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reg = value.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{1,16}$/.test(reg) ? reg : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- A customer's request ----------------------------------------------------

export interface QuoteRequestInput {
  reg?: unknown;
  make?: unknown;
  model?: unknown;
  description?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  postcode?: unknown;
}

export interface CleanQuoteRequest {
  vehicle_reg: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  request_text: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  postcode: string | null;
}

/**
 * A request as the customer typed it, checked. Every refusal is a sentence the
 * customer reads verbatim (website and app alike).
 */
export function cleanQuoteRequest(
  input: QuoteRequestInput,
): { ok: true; request: CleanQuoteRequest } | { ok: false; error: string } {
  const reg = normaliseQuoteReg(input.reg);
  if (!reg) return { ok: false, error: "Enter your registration number." };
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 5) return { ok: false, error: "Tell us a little about the job you need." };
  if (description.length > CUSTOM_QUOTE_LIMITS.request)
    return { ok: false, error: `Please keep the description under ${CUSTOM_QUOTE_LIMITS.request} characters.` };
  const name = clean(input.name, CUSTOM_QUOTE_LIMITS.name);
  if (!name) return { ok: false, error: "Enter your name." };
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "Enter a valid email address." };
  return {
    ok: true,
    request: {
      vehicle_reg: reg,
      vehicle_make: clean(input.make, CUSTOM_QUOTE_LIMITS.make),
      vehicle_model: clean(input.model, CUSTOM_QUOTE_LIMITS.model),
      request_text: description,
      customer_name: name,
      customer_email: email,
      customer_phone: clean(input.phone, CUSTOM_QUOTE_LIMITS.phone),
      postcode: clean(input.postcode, CUSTOM_QUOTE_LIMITS.postcode)?.toUpperCase() ?? null,
    },
  };
}

// --- The admin's quote -------------------------------------------------------

export interface AdminQuoteInput {
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
  reg?: unknown;
  make?: unknown;
  model?: unknown;
  postcode?: unknown;
  title?: unknown;
  details?: unknown;
  /** Pence. */
  totalPence?: unknown;
  visitHours?: unknown;
}

export interface CleanAdminQuote {
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  vehicle_reg: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  postcode: string | null;
  title: string | null;
  details: string | null;
  total_pence: number | null;
  visit_hours: number;
}

/**
 * The admin's form, checked. `forSending` also demands what the customer will
 * approve: what the work is, the vehicle's make (the booking needs it), and the
 * price. A draft can be saved without them.
 */
export function cleanAdminQuote(
  input: AdminQuoteInput,
  forSending: boolean,
): { ok: true; quote: CleanAdminQuote } | { ok: false; error: string } {
  const name = clean(input.customerName, CUSTOM_QUOTE_LIMITS.name);
  if (!name) return { ok: false, error: "Enter the customer's name." };
  const email = typeof input.customerEmail === "string" ? input.customerEmail.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter the customer's email address." };
  const reg = normaliseQuoteReg(input.reg);
  if (!reg) return { ok: false, error: "Enter the vehicle's registration." };
  const make = clean(input.make, CUSTOM_QUOTE_LIMITS.make);
  const title = clean(input.title, CUSTOM_QUOTE_LIMITS.title);
  const details =
    typeof input.details === "string" && input.details.trim()
      ? input.details.trim().slice(0, CUSTOM_QUOTE_LIMITS.details)
      : null;

  let total: number | null = null;
  if (input.totalPence != null && input.totalPence !== "") {
    const t = Math.round(Number(input.totalPence));
    if (!Number.isFinite(t) || t <= 0) return { ok: false, error: "Enter a price above £0." };
    if (t > CUSTOM_QUOTE_LIMITS.maxTotalPence) return { ok: false, error: "That price looks too high. Check it and try again." };
    total = t;
  }
  const hours = num(input.visitHours as number | string | null) ?? 1;
  if (hours <= 0 || hours > CUSTOM_QUOTE_LIMITS.maxVisitHours)
    return { ok: false, error: "Enter how long the visit takes (more than 0, up to 24 hours)." };

  if (forSending) {
    if (!title) return { ok: false, error: "Say what the work is before sending." };
    if (!make) return { ok: false, error: "Enter the vehicle's make before sending." };
    if (total == null) return { ok: false, error: "Enter the price before sending." };
  }

  return {
    ok: true,
    quote: {
      customer_name: name,
      customer_email: email,
      customer_phone: clean(input.customerPhone, CUSTOM_QUOTE_LIMITS.phone),
      vehicle_reg: reg,
      vehicle_make: make,
      vehicle_model: clean(input.model, CUSTOM_QUOTE_LIMITS.model),
      postcode: clean(input.postcode, CUSTOM_QUOTE_LIMITS.postcode)?.toUpperCase() ?? null,
      title,
      details,
      total_pence: total,
      visit_hours: Math.round(hours * 100) / 100,
    },
  };
}

/** Which statuses the admin can still edit, send and withdraw. */
export const isOpenForAdmin = (status: CustomQuoteStatus): boolean => status === "requested" || status === "sent";

// --- Booking it ---------------------------------------------------------------

/** Who is asking to book or decline: the signed-in account. */
export interface QuoteCaller {
  userId: string;
  email: string | null;
}

/**
 * Whether this account may act on the quote: it was raised for this account,
 * or sent to this account's email address. The link alone is not enough to
 * book on someone else's behalf.
 */
export function ownsCustomQuote(row: Pick<CustomQuoteRow, "customer_id" | "customer_email">, caller: QuoteCaller): boolean {
  if (row.customer_id && row.customer_id === caller.userId) return true;
  const email = caller.email?.trim().toLowerCase();
  return Boolean(email) && email === row.customer_email.trim().toLowerCase();
}

/** Why a quote can't be booked right now, as the customer reads it, or null when it can. */
export function customQuoteRefusal(row: Pick<CustomQuoteRow, "status" | "booking_id" | "total_pence" | "title">): string | null {
  if (row.status === "booked" || row.booking_id) return "You've already booked this quote.";
  if (row.status === "requested") return "We're still pricing this job. We'll email you as soon as your quote is ready.";
  if (row.status === "declined") return "You declined this quote. Get in touch if you'd like it again.";
  if (row.status === "withdrawn") return "This quote has been cancelled. Get in touch if you'd still like the work done.";
  if (row.total_pence == null || !row.title) return "This quote can't be booked. Please get in touch.";
  return null;
}

/** The single line a custom quote books as: "q:<quote id>", like a follow-on quote's lines. */
export const customQuoteLineId = (quoteId: string): string => `q:${quoteId}`;

/**
 * A sent custom quote priced as a booking: the SAME `RepairsQuote` shape the
 * funnel prices catalogue jobs into, so prepare and create need to know
 * nothing about it beyond where the price came from. One fixed line at the
 * quoted total; the commission is the one snapshotted when it was sent.
 */
export function buildCustomQuote(
  row: Pick<CustomQuoteRow, "id" | "title" | "total_pence" | "visit_hours" | "hourly_rate_pence" | "commission_rate">,
  fallbacks: { hourlyRatePence: number; commissionRate: number },
): RepairsQuote | null {
  if (row.total_pence == null || row.total_pence <= 0 || !row.title) return null;
  const visitHours = Math.max(0.25, num(row.visit_hours) ?? 1);
  const hourlyRatePence = row.hourly_rate_pence ?? fallbacks.hourlyRatePence;
  const commissionRate = num(row.commission_rate) ?? fallbacks.commissionRate;
  const lineId = customQuoteLineId(row.id);
  const breakdown = {
    ...computePrice({
      durationHours: visitHours,
      hourlyRatePence,
      overridePricePence: row.total_pence,
      partsPence: 0,
      commissionRate,
      areaId: null,
    }),
    durationSource: "vehicle" as const,
    vehicleRawDurationHours: visitHours,
  };
  return {
    itemIds: [lineId],
    items: [],
    nodeIds: [],
    lines: [
      {
        nodeId: lineId,
        description: row.title,
        rawHours: 0,
        chargedHours: 0,
        linePence: row.total_pence,
        itemId: lineId,
        itemLabel: null,
        kind: "product",
      },
    ],
    description: row.title,
    combinedRawHours: 0,
    billedHours: 0,
    combineSource: null,
    breakdown,
    products: [],
    labourPence: 0,
    fixedPence: row.total_pence,
    oil: null,
    visitHours,
    parts: [],
  };
}

// --- What a customer sees -------------------------------------------------------

/** A custom quote as the customer's app reads it (GET /custom-quotes). */
export interface CustomQuoteView {
  id: string;
  status: CustomQuoteStatus;
  statusLabel: string;
  /** What they asked for, in their words; null when we started it. */
  request: string | null;
  /** What's quoted; null until it's priced. */
  title: string | null;
  details: string | null;
  /** The total; null until it's priced. */
  totalPence: number | null;
  /** Hours the visit is blocked out for. */
  visitHours: number;
  vehicle: { reg: string; make: string | null; model: string | null };
  postcode: string | null;
  /** True when it can be booked now: pass the id as `quoteId` to /checkout/prepare and /bookings. */
  canBook: boolean;
  /** True while the customer can still decline it. */
  canDecline: boolean;
  bookingId: string | null;
  createdAt: string;
  sentAt: string | null;
}

export function toCustomQuoteView(row: CustomQuoteRow): CustomQuoteView {
  const priced = row.status !== "requested";
  return {
    id: row.id,
    status: row.status,
    statusLabel: CUSTOM_QUOTE_STATUS_LABEL[row.status],
    request: row.request_text,
    title: priced ? row.title : null,
    details: priced ? row.details : null,
    totalPence: priced ? row.total_pence : null,
    visitHours: num(row.visit_hours) ?? 1,
    vehicle: { reg: row.vehicle_reg, make: row.vehicle_make, model: row.vehicle_model },
    postcode: row.postcode,
    canBook: customQuoteRefusal(row) == null,
    canDecline: row.status === "requested" || row.status === "sent",
    bookingId: row.booking_id,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}
