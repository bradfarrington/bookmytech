import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

// Pure push helpers — no "server-only", no Supabase — so lib/push/push.test.ts
// can import them (same split as lib/haynespro/health.ts). Sending lives in
// ./send.ts.

export interface PushNotification {
  title: string;
  body: string;
  /**
   * The booking the app opens when the notification is tapped. It is the ONLY
   * thing the app deep-links on (`bookingIdFromResponse` in the app's
   * src/lib/push.ts); a notification without one just opens the app.
   */
  bookingId?: string;
  /** Extra payload for future app builds (e.g. a reminder's tracked CTA link). */
  data?: Record<string, string>;
}

/** The Android channel the app creates before requesting a token. */
export const ANDROID_CHANNEL = "bookings";

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && Expo.isExpoPushToken(token);
}

/** Build the wire message for one device. */
export function buildPushMessage(token: string, n: PushNotification): ExpoPushMessage {
  return {
    to: token,
    title: n.title,
    body: n.body,
    data: { ...(n.data ?? {}), ...(n.bookingId ? { bookingId: n.bookingId } : {}) },
    sound: "default",
    priority: "high",
    channelId: ANDROID_CHANNEL,
  };
}

/**
 * Sort a batch of tickets into what to park for a receipt check and what to
 * delete now. `messages[i]` produced `tickets[i]` — Expo returns tickets in
 * message order.
 */
export function triageTickets(
  messages: ExpoPushMessage[],
  tickets: ExpoPushTicket[],
): { receipts: Array<{ ticket_id: string; token: string }>; deadTokens: string[]; failed: number } {
  const receipts: Array<{ ticket_id: string; token: string }> = [];
  const deadTokens: string[] = [];
  let failed = 0;
  tickets.forEach((ticket, i) => {
    const to = messages[i]?.to;
    const token = Array.isArray(to) ? to[0] : to;
    if (!token) return;
    if (ticket.status === "ok") {
      receipts.push({ ticket_id: ticket.id, token });
    } else if (ticket.details?.error === "DeviceNotRegistered") {
      deadTokens.push(token);
    } else {
      failed += 1;
    }
  });
  return { receipts, deadTokens, failed };
}
