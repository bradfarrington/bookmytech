import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { siteUrl } from "@/lib/utils";
import { ESCALATION_HOURS } from "@/lib/disputes/constants";
import { pushMechanicUpdate } from "@/lib/push/mechanic-updates";

// Hourly dispute escalation (Task 12 Stage 1).
//
// A dispute that the parties haven't resolved themselves escalates to the admin
// mediator automatically: 'opened' with no response within ESCALATION_HOURS, or
// 'responded' but still unresolved ESCALATION_HOURS after the response. Flips it
// to 'escalated', logs the event, and emails the admin. Idempotent — only
// non-escalated, non-closed disputes are touched.
//
// Next API route + vercel.json cron, not a Supabase edge function (project
// convention). Protected by CRON_SECRET when set.

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "support@bookmytech.co.uk";

async function runEscalation() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - ESCALATION_HOURS * 60 * 60 * 1000).toISOString();

  // opened > 48h ago (other party never engaged) OR responded > 48h ago (no
  // agreement reached). Two simple queries, merged.
  const [{ data: staleOpened }, { data: staleResponded }] = await Promise.all([
    admin.from("disputes").select("id, booking_id").eq("status", "opened").lt("created_at", cutoff),
    admin.from("disputes").select("id, booking_id").eq("status", "responded").lt("responded_at", cutoff),
  ]);

  const due = [...(staleOpened ?? []), ...(staleResponded ?? [])];
  if (!due.length) return { escalated: 0 };

  const nowIso = new Date().toISOString();
  for (const d of due) {
    await admin.from("disputes").update({ status: "escalated", escalated_at: nowIso }).eq("id", d.id);
    await admin.from("booking_events").insert({
      booking_id: d.booking_id,
      event_type: "dispute_escalated",
      actor_role: "system",
      reason: `Auto-escalated after ${ESCALATION_HOURS}h without resolution.`,
      payload: { dispute_id: d.id, escalated_by: "system" },
    });
  }

  // Tell each mechanic's phone that the decision has passed to us (Task 69).
  // There has never been an email for an automatic escalation, so this is the
  // push alone.
  const { data: jobs } = await admin
    .from("bookings")
    .select("id, mechanic_id")
    .in("id", due.map((d) => d.booking_id));
  const mechanicByBooking = new Map((jobs ?? []).map((b) => [b.id as string, b.mechanic_id as string | null]));
  for (const d of due) {
    pushMechanicUpdate(
      mechanicByBooking.get(d.booking_id),
      { title: "Book My Tech is stepping in", body: `It wasn't settled within ${ESCALATION_HOURS} hours, so we'll review it and decide.` },
      { type: "dispute", disputeId: d.id },
    );
  }

  const { subject, html } = await renderTemplateEmail("disputes_escalated_alert", {
    count: due.length,
    intro: `${due.length} dispute${due.length > 1 ? "s have" : " has"} auto-escalated after ${ESCALATION_HOURS} hours without resolution.`,
    link: `${siteUrl()}/admin/disputes`,
  });
  await sendEmail({ to: ADMIN_EMAIL, subject, html }).catch((e) =>
    console.error("escalation email failed", e),
  );

  return { escalated: due.length };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runEscalation();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("escalate-disputes failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "escalation failed" },
      { status: 500 },
    );
  }
}
