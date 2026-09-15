// The small rules Home, the booking detail and the mechanic profile share
// (Task 48): what's waiting on the customer, which action a past job offers,
// where "Book again" goes, and the dates they print. Pure, with no server-only
// imports, so client components can use it and it's unit-tested.

import type { CustomerBooking } from "@/lib/dashboard/customer-bookings";
import { isLiveStatus, isPastStatus } from "@/lib/bookings/status-meta";
import { BOOKING_TIME_ZONE, daysBetweenKeys, londonDateKey } from "@/lib/slots";

/** bookings.reschedule_status while a mechanic's proposed time waits on the customer. */
export const RESCHEDULE_PROPOSED = "proposed";

/** A completed job can be reported for this long (the same rule as /dashboard/disputes/new). */
export const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** How many past jobs Home shows before "Show all". */
export const PAST_JOBS_SHOWN = 5;

// ---------------------------------------------------------------------------
// Names and dates
// ---------------------------------------------------------------------------

/** "Hannah" from "Hannah Reid"; null when there's no name to use. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function londonParts(at: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", { ...options, timeZone: BOOKING_TIME_ZONE }).formatToParts(at)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

/** Home's greeting caption: "Thu, 15 Jan", in UK time. */
export function greetingDate(now: Date): string {
  const p = londonParts(now, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday}, ${p.day} ${p.month}`;
}

/** "12 Aug", with the year when it isn't this year's: "12 Aug 2025". */
export function shortDate(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const p = londonParts(at, { day: "numeric", month: "short", year: "numeric" });
  const thisYear = londonParts(now, { year: "numeric" }).year;
  return p.year === thisYear ? `${p.day} ${p.month}` : `${p.day} ${p.month} ${p.year}`;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago", "2 years ago" (UK calendar days). */
export function timeAgo(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = daysBetweenKeys(londonDateKey(at), londonDateKey(now));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function jobsDoneLabel(count: number): string {
  return count === 1 ? "1 job done" : `${count} jobs done`;
}

/** What the booking loader calls a mechanic with no name on file. */
const UNNAMED_MECHANIC = "Your mechanic";

/** "Alex" from "Alex Turner"; "Your mechanic" when there's no name. */
export function mechanicFirstName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === UNNAMED_MECHANIC) return UNNAMED_MECHANIC;
  return trimmed.split(/\s+/)[0];
}

/** "James M" for a past-job caption; null when there's no name to show. */
export function mechanicShortName(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.join(" ") === UNNAMED_MECHANIC) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}`;
}

/** A dialable tel: link, keeping only digits and a leading +. */
export function telHref(phone: string): string {
  const cleaned = phone.trim().replace(/(?!^\+)[^\d]/g, "");
  return `tel:${cleaned}`;
}

/** "2pm" or "2:30pm", UK time. */
export function clockLabel(at: Date): string {
  const p = londonParts(at, { hour: "numeric", minute: "2-digit", hourCycle: "h23" });
  const hour = Number(p.hour) % 24;
  const minute = (p.minute ?? "0").padStart(2, "0");
  const suffix = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === "00" ? `${h12}${suffix}` : `${h12}:${minute}${suffix}`;
}

/** A mechanic's proposed time: "Thu 15 Jan at 2pm". */
export function proposedTimeLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "a new time";
  const p = londonParts(at, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday} ${p.day} ${p.month} at ${clockLabel(at)}`;
}

// ---------------------------------------------------------------------------
// What a booking offers
// ---------------------------------------------------------------------------

type Rebookable = Pick<CustomerBooking, "vehicleReg" | "postcode" | "repairNodeIds" | "vehicleMake" | "vehicleModel">;

/**
 * Where "Book again" goes. With the repairs known it deep-links to the match
 * step with the vehicle and postcode filled in (every job of a multi-job
 * booking comes along); `preferMechanicId` asks for the same mechanic first.
 * A legacy booking with no repair ids starts the booking flow with the reg.
 */
export function rebookHref(booking: Rebookable, preferMechanicId: string | null = null): string {
  if (booking.repairNodeIds.length === 0) return `/book?reg=${encodeURIComponent(booking.vehicleReg)}`;
  const params = new URLSearchParams({ reg: booking.vehicleReg, repairs: booking.repairNodeIds.join(",") });
  if (booking.postcode) params.set("postcode", booking.postcode);
  if (booking.vehicleMake) params.set("make", booking.vehicleMake);
  if (booking.vehicleModel) params.set("model", booking.vehicleModel);
  if (preferMechanicId) params.set("pref", preferMechanicId);
  return `/book/match?${params.toString()}`;
}

export function canRebook(booking: Pick<CustomerBooking, "status">): boolean {
  return booking.status === "completed" || booking.status === "cancelled";
}

export function canReview(booking: Pick<CustomerBooking, "status" | "mechanicId" | "rating">): boolean {
  return booking.status === "completed" && !!booking.mechanicId && booking.rating == null;
}

export function canReportProblem(
  booking: Pick<CustomerBooking, "status" | "completedAt" | "dispute"> & { ownedByAccount?: boolean },
  now: Date,
): boolean {
  // /dashboard/disputes/new only accepts bookings linked to the account, not a
  // guest-era one matched by email, so don't offer a link it would refuse.
  if (booking.ownedByAccount === false) return false;
  if (booking.status !== "completed" || booking.dispute || !booking.completedAt) return false;
  const completedMs = new Date(booking.completedAt).getTime();
  return Number.isFinite(completedMs) && completedMs > 0 && now.getTime() - completedMs <= DISPUTE_WINDOW_MS;
}

export interface PastJobAction {
  label: string;
  href: string;
}

/** The one link a past-job card on Home offers: its dispute, a review, or Book again. */
export function pastJobAction(
  booking: Rebookable & Pick<CustomerBooking, "id" | "status" | "mechanicId" | "rating" | "dispute">,
): PastJobAction | null {
  if (booking.dispute) return { label: "View dispute", href: `/dashboard/disputes/${booking.dispute.id}` };
  if (canReview(booking)) return { label: "Rate your mechanic", href: `/dashboard/bookings/${booking.id}/review` };
  if (canRebook(booking)) return { label: "Book again", href: rebookHref(booking, booking.mechanicId) };
  return null;
}

/**
 * When money moves, under the booking detail's Payment card: pre-authorised at
 * booking and taken when the job is complete, or nothing to pay when a
 * discount and/or account credit covered it ("free" payment mode). Null where
 * there's nothing we can say for certain (a cancelled or disputed booking).
 */
export function paymentNote(
  booking: Pick<CustomerBooking, "status" | "paymentMode" | "totalPence" | "discountPence">,
): string | null {
  if (booking.status === "cancelled" || booking.status === "disputed") return null;
  if (booking.paymentMode === "free") {
    if (booking.discountPence > 0 && booking.discountPence >= booking.totalPence) {
      return "Covered in full by your discount, so there's nothing to pay.";
    }
    return booking.discountPence > 0
      ? "Covered in full by your discount and account credit, so there's nothing to pay."
      : "Covered in full by your account credit, so there's nothing to pay.";
  }
  if (booking.status === "completed") {
    return "Your payment was taken when the job was completed, and your receipt was emailed to you.";
  }
  return "Your payment is pre-authorised on your card. No money leaves your account until your mechanic completes the job.";
}

/** A proposed new time the customer can still answer. */
export function proposedTime(
  booking: Pick<CustomerBooking, "status" | "rescheduleStatus" | "rescheduleProposedAt">,
): string | null {
  if (booking.rescheduleStatus !== RESCHEDULE_PROPOSED || !booking.rescheduleProposedAt) return null;
  return isPastStatus(booking.status) ? null : booking.rescheduleProposedAt;
}

export type WaitingItem<B extends CustomerBooking = CustomerBooking> =
  | { kind: "revision"; key: string; booking: B; revision: NonNullable<B["pendingRevision"]> }
  | { kind: "quote"; key: string; booking: B; quote: NonNullable<B["pendingQuote"]> }
  | { kind: "reschedule"; key: string; booking: B; proposedAt: string };

/**
 * Everything waiting on the customer, most pressing first: a revised job (the
 * mechanic is usually on site), then quotes, then proposed times. Soonest
 * booking first within each kind.
 */
export function waitingOnCustomer<B extends CustomerBooking>(bookings: B[]): WaitingItem<B>[] {
  const time = (b: B) => (b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER);
  const ordered = [...bookings].sort((a, b) => time(a) - time(b));
  const items: WaitingItem<B>[] = [];
  for (const booking of ordered) {
    if (booking.pendingRevision) {
      items.push({ kind: "revision", key: `revision-${booking.pendingRevision.id}`, booking, revision: booking.pendingRevision });
    }
  }
  for (const booking of ordered) {
    if (booking.pendingQuote) {
      items.push({ kind: "quote", key: `quote-${booking.pendingQuote.id}`, booking, quote: booking.pendingQuote });
    }
  }
  for (const booking of ordered) {
    const proposedAt = proposedTime(booking);
    if (proposedAt) items.push({ kind: "reschedule", key: `reschedule-${booking.id}`, booking, proposedAt });
  }
  return items;
}

/** Home keeps refreshing while a job is moving on its own: live, or still finding a mechanic. */
export function homeNeedsRefresh(bookings: Array<Pick<CustomerBooking, "status">>): boolean {
  return bookings.some((b) => isLiveStatus(b.status) || b.status === "sourcing_mechanic");
}
