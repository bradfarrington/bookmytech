import "server-only";
import { ANDROID_UPDATES_CHANNEL } from "@/lib/push/format";
import { sendPushToMechanic } from "@/lib/push/send";

// Everything the mechanic app is told that ISN'T a job offer (Tasks 66, 67, 69):
// one call so every such push lands on the quiet `updates` channel and carries
// the `data.type` the app routes on. Always beside the email or SMS the
// mechanic already gets, never instead of it — a mechanic without the app must
// hear exactly what they heard before.
//
//   type        opens                  also carries
//   dispute     the dispute            disputeId
//   case        the Get-help case      caseId
//   job         the job                bookingId
//   message     the customer thread    bookingId
//   reviews / earnings / documents / status   that screen
//
// Best-effort, like every notification here: it never throws, and a mechanic
// with no registered device is a no-op.

export type MechanicUpdate =
  | { type: "dispute"; disputeId: string }
  | { type: "case"; caseId: string }
  | { type: "job"; bookingId: string }
  | { type: "message"; bookingId: string }
  | { type: "reviews" | "earnings" | "documents" | "status" };

export function pushMechanicUpdate(
  mechanicId: string | null | undefined,
  notification: { title: string; body: string },
  update: MechanicUpdate,
): void {
  if (!mechanicId) return;
  const { type, ...ids } = update;
  const bookingId = "bookingId" in ids ? ids.bookingId : undefined;
  const extra: Record<string, string> = { type };
  if ("disputeId" in ids) extra.disputeId = ids.disputeId;
  if ("caseId" in ids) extra.caseId = ids.caseId;

  sendPushToMechanic(mechanicId, {
    title: notification.title,
    body: notification.body,
    bookingId,
    data: extra,
    channelId: ANDROID_UPDATES_CHANNEL,
  }).catch(() => {});
}
