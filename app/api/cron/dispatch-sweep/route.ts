import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { formatPrice, formatJobNumber } from "@/lib/utils";

// Admin-notification sweep (Task 05 Stage 2).
//
// In the broadcast / first-to-accept dispatch model there is NO sequential
// re-dispatch and NO auto-widening of radius. The single escalation is: if a
// booking is still unaccepted 5 minutes after it was created, notify the admin
// that nobody has picked it up. This route does that idempotently — it writes
// a one-off `dispatch_stalled` note event per booking so the same booking is
// never flagged twice, and emails the admin a summary.
//
// Trigger it on a schedule (Vercel Cron or Supabase pg_cron → see vercel.json
// and the HANDOFF). Protected by CRON_SECRET when set; with no secret (local
// dev) it's open so it can be curled for testing.

const STALL_MINUTES = 5;

interface StalledBooking {
  id: string;
  job_number: number | null;
  customer_name: string | null;
  postcode: string | null;
  area: string | null;
  total_pence: number | null;
  service: { name: string | null } | { name: string | null }[] | null;
}

function serviceName(b: StalledBooking): string {
  const s = Array.isArray(b.service) ? b.service[0] : b.service;
  return s?.name ?? "Service";
}

async function runSweep() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALL_MINUTES * 60 * 1000).toISOString();

  const { data: stalled } = await admin
    .from("bookings")
    .select(
      "id, job_number, customer_name, postcode, area, total_pence, service:services(name)",
    )
    .eq("status", "sourcing_mechanic")
    .lt("created_at", cutoff);

  if (!stalled?.length) return { notified: 0 };

  const ids = stalled.map((b) => b.id);

  // Dedup: skip any booking already flagged as stalled.
  const { data: existing } = await admin
    .from("booking_events")
    .select("booking_id, payload")
    .in("booking_id", ids)
    .eq("event_type", "note");

  const alreadyFlagged = new Set(
    (existing ?? [])
      .filter((e) => (e.payload as { kind?: string } | null)?.kind === "dispatch_stalled")
      .map((e) => e.booking_id),
  );

  const toFlag = (stalled as StalledBooking[]).filter(
    (b) => !alreadyFlagged.has(b.id),
  );
  if (!toFlag.length) return { notified: 0 };

  for (const b of toFlag) {
    await admin.from("booking_events").insert({
      booking_id: b.id,
      event_type: "note",
      actor_role: "system",
      reason: `No mechanic accepted within ${STALL_MINUTES} minutes — needs attention.`,
      payload: { kind: "dispatch_stalled" },
    });
  }

  // One summary email to the admin.
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || "help@bookmytech.co.uk";
  const bookings = toFlag
    .map(
      (b) =>
        `#${formatJobNumber(b.job_number)} · ${serviceName(b)} · ${b.area ?? b.postcode ?? "—"} · ${formatPrice(b.total_pence ?? 0)}`,
    )
    .join("|");
  const { subject, html } = await renderTemplateEmail("dispatch_stall_alert", {
    count: toFlag.length,
    intro: `${toFlag.length} booking${toFlag.length > 1 ? "s have" : " has"} had no mechanic accept within ${STALL_MINUTES} minutes.`,
    bookings,
    link: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/jobs`,
  });
  await sendEmail({ to: adminEmail, subject, html }).catch((err) =>
    console.error("Admin stall email failed", err),
  );

  return { notified: toFlag.length };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await runSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("dispatch-sweep failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sweep failed" },
      { status: 500 },
    );
  }
}
