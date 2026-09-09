import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { REVISION_COLUMNS, toRevisionView } from "./load";
import { withdrawHoldQuote } from "./mechanic";
import { notifyMechanicRevisionOutcome, type RevisionBookingContact } from "./notify";

// Lapse revised jobs the customer never answered (Task 37). Run hourly by
// /api/cron/expire-quotes alongside the quotes. A difference hold the customer
// started but didn't finish is released; the mechanic is told so they can
// re-send or end the job.

export async function expireStaleRevisions(): Promise<{ expiredRevisions: number }> {
  const admin = createAdminClient();
  const { data: stale } = await admin
    .from("job_revisions")
    .select(REVISION_COLUMNS)
    .eq("status", "sent")
    .lt("expires_at", new Date().toISOString())
    .limit(200);
  let expired = 0;
  for (const row of stale ?? []) {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("job_revisions")
      .update({ status: "expired", responded_at: now, updated_at: now })
      .eq("id", row.id)
      .eq("status", "sent");
    if (error) continue;
    expired += 1;
    const revision = toRevisionView(row as Record<string, unknown>);
    await withdrawHoldQuote(admin, revision);
    await admin.from("booking_events").insert({
      booking_id: revision.bookingId,
      event_type: "revision_expired",
      actor_role: "system",
      payload: { revision_id: revision.id, difference_pence: revision.differencePence },
    });
    const { data: booking } = await admin
      .from("bookings")
      .select("id, job_number, customer_id, customer_email, customer_name, customer_phone, mechanic_id")
      .eq("id", revision.bookingId)
      .maybeSingle();
    if (booking) void notifyMechanicRevisionOutcome(booking as RevisionBookingContact, revision, "expired");
  }
  return { expiredRevisions: expired };
}
