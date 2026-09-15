// Formatting for the customer's message thread (Task 48). Pure, so it's
// unit-tested and safe in the client component.

import { BOOKING_TIME_ZONE, daysBetweenKeys, formatBookingDay, londonDateKey } from "@/lib/slots";

export interface ChatMessage {
  id: string;
  sender_role: "customer" | "mechanic";
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ChatDay {
  key: string;
  label: string;
  messages: ChatMessage[];
}

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BOOKING_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "9:12" or "14:05", UK time. */
export function messageTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const parts: Record<string, string> = {};
  for (const part of TIME_FORMAT.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${Number(parts.hour) % 24}:${(parts.minute ?? "0").padStart(2, "0")}`;
}

/** "Today", "Yesterday", or the day ("Mon 12 Jan"), by UK calendar day. */
export function messageDayLabel(iso: string, now: Date): string {
  const diff = daysBetweenKeys(londonDateKey(new Date(iso)), londonDateKey(now));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatBookingDay(iso);
}

/** Consecutive messages grouped under their UK calendar day, oldest first. */
export function groupMessagesByDay(messages: ChatMessage[], now: Date): ChatDay[] {
  const days: ChatDay[] = [];
  for (const message of messages) {
    const at = new Date(message.created_at);
    if (Number.isNaN(at.getTime())) continue;
    const key = londonDateKey(at);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.messages.push(message);
    } else {
      days.push({ key, label: messageDayLabel(message.created_at, now), messages: [message] });
    }
  }
  return days;
}

/** The customer's latest message, which carries the Sent / Read note. */
export function lastOwnMessageId(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender_role === "customer") return messages[i].id;
  }
  return null;
}

/** Whether opening the thread has anything to mark read. */
export function hasUnreadFromMechanic(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.sender_role === "mechanic" && !message.read_at);
}
