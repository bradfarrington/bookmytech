// How a booking status reads to a customer, and which group it belongs to.
// The same words and tones as the app's STATUS_META (bmt-customer-app
// src/lib/bookings.ts), so a customer who uses both sees the same labels.
// Plain module: safe for client components.

export type BookingStatusTone = "active" | "success" | "pending" | "error" | "neutral";

export interface BookingStatusMeta {
  /** Short, for a pill: "On the way". */
  label: string;
  /** For a sentence or a timeline line: "Mechanic on the way". */
  longLabel: string;
  tone: BookingStatusTone;
}

export const BOOKING_STATUS_META: Record<string, BookingStatusMeta> = {
  sourcing_mechanic: { label: "Finding mechanic", longLabel: "Finding you a mechanic", tone: "pending" },
  confirmed: { label: "Confirmed", longLabel: "Confirmed", tone: "active" },
  en_route: { label: "On the way", longLabel: "Mechanic on the way", tone: "active" },
  in_progress: { label: "In progress", longLabel: "Work in progress", tone: "active" },
  completed: { label: "Completed", longLabel: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", longLabel: "Cancelled", tone: "neutral" },
  disputed: { label: "Under review", longLabel: "Under review", tone: "error" },
};

/** Known statuses get their words; an unknown one is null, never a raw database value. */
export function bookingStatusMeta(status: string): BookingStatusMeta | null {
  return BOOKING_STATUS_META[status] ?? null;
}

/** Happening now: the dashboard's live hero. */
export const LIVE_STATUSES = ["en_route", "in_progress"] as const;
/** Booked, not started. */
export const UPCOMING_STATUSES = ["sourcing_mechanic", "confirmed"] as const;
/** Finished one way or another. */
export const PAST_STATUSES = ["completed", "cancelled", "disputed"] as const;

export function isLiveStatus(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}

export function isUpcomingStatus(status: string): boolean {
  return (UPCOMING_STATUSES as readonly string[]).includes(status);
}

export function isPastStatus(status: string): boolean {
  return (PAST_STATUSES as readonly string[]).includes(status);
}
