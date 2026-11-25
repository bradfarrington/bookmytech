import { bookingStatusMeta } from "@/lib/bookings/status-meta";
import { formatBookingDay, londonInstant } from "@/lib/slots";

// What a customer is told about their bookings, one line per event, for the
// Inbox (Task 52) and a booking's timeline. The website's twin of the app's
// src/lib/booking-events.ts: the same allow-list and the same wording.
//
// An ALLOW-LIST on purpose. The CRM writes many internal event types
// (payout_transferred, note, …). Anything not named here is not shown, so a new
// event type stays out of customers' feeds until it has wording.

export interface CustomerEvent {
  id: string;
  event_type: string;
  created_at: string;
  reason: string | null;
  payload: unknown;
}

const EVENT_LABELS: Record<string, string> = {
  cancelled: "Booking cancelled",
  payment_captured: "Payment taken",
  payment_refunded: "Refund issued",
  disputed: "Raised for review",
  dispute_opened: "Dispute opened",
  dispute_responded: "Dispute updated",
  dispute_resolved: "Dispute resolved",
  reschedule_proposed: "New time proposed",
  reschedule_accepted: "New time agreed",
  arrival_window_set: "Arrival window confirmed",
  message_sent: "New message from your mechanic",
  fault_added: "Mechanic noted a fault",
  quote_sent: "Quote sent for extra work",
  quote_approved: "Quote approved",
  quote_declined: "Quote declined",
  quote_withdrawn: "Quote withdrawn by your mechanic",
  quote_expired: "Quote expired",
  revision_sent: "Mechanic proposed a revised job",
  revision_approved: "Revised job approved",
  revision_declined: "Revised job declined",
  revision_withdrawn: "Revised job withdrawn by your mechanic",
  revision_expired: "Revised job proposal expired",
};

/** Every event type `describeEvent` can word: the server-side filter for a feed. */
export const CUSTOMER_EVENT_TYPES = ["status_changed", ...Object.keys(EVENT_LABELS)];

/** A reminder's title, by reminder_type. The same allow-list rule. */
export const REMINDER_TITLES: Record<string, string> = {
  mot_due: "Your MOT is due soon",
  annual_service: "Time for your annual service",
  winter_battery: "Winter battery check",
  summer_aircon: "Summer air-con check",
  brake_check: "Brake follow-up due",
};

/** "YYYY-MM-DD" or an ISO instant, whichever the payload carries. */
function dayFrom(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return londonInstant(value, 12);
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** One line for this event, or null when it isn't the customer's business. */
export function describeEvent(event: CustomerEvent): string | null {
  const payload = (event.payload ?? null) as Record<string, unknown> | null;

  if (event.event_type === "status_changed") {
    const to = typeof payload?.status_to === "string" ? payload.status_to : null;
    return to ? (bookingStatusMeta(to)?.longLabel ?? null) : null;
  }

  if (event.event_type === "arrival_window_set") {
    const day = dayFrom(payload?.day) ?? dayFrom(payload?.to);
    return day ? `Arrival confirmed for ${formatBookingDay(day.toISOString())}` : EVENT_LABELS.arrival_window_set;
  }

  if (event.event_type === "message_sent") {
    // Only the mechanic's messages are news to the customer. Their own message
    // is written to booking_events too, for the audit trail and the admin live
    // feed, and would otherwise come back at them as a notification.
    return payload?.from === "mechanic" ? EVENT_LABELS.message_sent : null;
  }

  if (event.event_type === "cancelled") {
    return payload?.outcome === "customer_declined_revision"
      ? "Visit ended after the revised job was declined"
      : EVENT_LABELS.cancelled;
  }

  if (event.event_type === "payment_captured") {
    if (payload?.kind === "on_site_diagnostic") return "On-site diagnostic fee taken";
    if (payload?.kind === "on_site_cancellation") return "Cancellation fee taken";
    return EVENT_LABELS.payment_captured;
  }

  return EVENT_LABELS[event.event_type] ?? null;
}
