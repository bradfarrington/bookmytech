import { formatRegistration, normaliseRegistration } from "@/lib/garage/status";
import { BOOKING_TIME_ZONE, daysBetweenKeys, formatBookingDay, londonDateKey } from "@/lib/slots";

// How the Inbox (Task 48, mockup 02 "Notifications") shows the feed from
// lib/inbox/feed.ts: which tab an item is in, its day heading, its time, its
// icon and where opening it goes. Pure, so it's unit-tested.

export type InboxTab = "all" | "bookings" | "reminders";

export const INBOX_TABS: ReadonlyArray<{ id: InboxTab; label: string; href: string }> = [
  { id: "all", label: "All", href: "/dashboard/inbox" },
  { id: "bookings", label: "Bookings", href: "/dashboard/inbox?tab=bookings" },
  { id: "reminders", label: "Reminders", href: "/dashboard/inbox?tab=reminders" },
];

interface FeedItem {
  id: string;
  kind: "booking" | "reminder";
  at: string;
  type: string;
  status: string | null;
  detail: string | null;
  bookingId: string | null;
  vehicleReg: string | null;
}

/** `?tab=` → a tab. Anything unknown is All. */
export function parseInboxTab(raw: string | string[] | undefined): InboxTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "bookings" || value === "reminders" ? value : "all";
}

export function filterInboxTab<T extends Pick<FeedItem, "kind">>(items: T[], tab: InboxTab): T[] {
  if (tab === "bookings") return items.filter((item) => item.kind === "booking");
  if (tab === "reminders") return items.filter((item) => item.kind === "reminder");
  return items;
}

/** "Today", "Yesterday", or "Tue 8 Sep" (with the year when it isn't this year), in London time. */
export function inboxDayLabel(at: string, now: Date = new Date()): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "Earlier";
  const key = londonDateKey(when);
  const today = londonDateKey(now);
  const diff = daysBetweenKeys(key, today);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  const day = formatBookingDay(when.toISOString());
  return key.slice(0, 4) === today.slice(0, 4) ? day : `${day} ${key.slice(0, 4)}`;
}

/** "09:23", London time. */
export function inboxTimeLabel(at: string): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: BOOKING_TIME_ZONE });
}

/** Newest-first items under their day headings, in the order they came. */
export function groupInboxByDay<T extends Pick<FeedItem, "at">>(
  items: T[],
  now: Date = new Date(),
): Array<{ label: string; items: T[] }> {
  const groups: Array<{ label: string; items: T[] }> = [];
  for (const item of items) {
    const label = inboxDayLabel(item.at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export type InboxIcon =
  | "car"
  | "quote"
  | "check"
  | "cross"
  | "card"
  | "dispute"
  | "bell"
  | "calendar"
  | "wrench"
  | "message";
export type InboxTone = "brand" | "warn" | "success" | "neutral";

/** The tile for an item, by what happened. */
export function inboxVisual(item: Pick<FeedItem, "kind" | "type" | "status">): { icon: InboxIcon; tone: InboxTone } {
  if (item.kind === "reminder") return { icon: "bell", tone: "brand" };
  const type = item.type;

  if (type === "status_changed") {
    switch (item.status) {
      case "en_route":
      case "in_progress":
        return { icon: "car", tone: "brand" };
      case "confirmed":
      case "completed":
        return { icon: "check", tone: "success" };
      case "cancelled":
        return { icon: "cross", tone: "neutral" };
      case "disputed":
        return { icon: "dispute", tone: "warn" };
      default:
        return { icon: "calendar", tone: "brand" };
    }
  }

  if (type === "message_sent") return { icon: "message", tone: "brand" };
  if (type === "disputed" || type.startsWith("dispute_")) return { icon: "dispute", tone: "warn" };
  if (type.startsWith("payment_")) return { icon: "card", tone: "brand" };
  // Outcomes before the quote and revision icon: an approved quote is good news, not a task.
  if (/_(approved|accepted)$/.test(type)) return { icon: "check", tone: "success" };
  if (type === "cancelled" || /_(declined|withdrawn|expired)$/.test(type)) return { icon: "cross", tone: "neutral" };
  if (type.startsWith("quote_") || type.startsWith("revision_")) return { icon: "quote", tone: "warn" };
  if (type === "fault_added") return { icon: "wrench", tone: "warn" };
  return { icon: "calendar", tone: "brand" };
}

/** Where opening an item goes: its booking, or the booking flow for a reminder's vehicle. */
export function inboxHref(item: Pick<FeedItem, "kind" | "type" | "bookingId" | "vehicleReg">): string {
  if (item.kind === "booking") {
    if (!item.bookingId) return "/dashboard";
    const booking = `/dashboard/bookings/${encodeURIComponent(item.bookingId)}`;
    // A message belongs in the thread, not on the booking summary: the point of
    // tapping it is to read what the mechanic said and reply.
    return item.type === "message_sent" ? `${booking}/messages` : booking;
  }
  const registration = item.vehicleReg ? normaliseRegistration(item.vehicleReg) : "";
  return registration ? `/book/vehicle?reg=${encodeURIComponent(registration)}` : "/book";
}

/** The line under the title: the job for booking news, the plate for a reminder. */
export function inboxDetail(item: Pick<FeedItem, "kind" | "detail" | "vehicleReg">): string | null {
  if (item.kind === "reminder") return item.vehicleReg ? formatRegistration(item.vehicleReg) : null;
  return item.detail;
}
