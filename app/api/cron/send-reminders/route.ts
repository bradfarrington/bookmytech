import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { sendSms } from "@/lib/sms/send-sms";
import { siteUrl } from "@/lib/utils";
import { renderReminderEmail } from "@/emails/reminder";
import { REMINDER_META, type ReminderType } from "@/lib/reminders/types";

// Hourly reminder sender (Task 11 Stage 1).
//
// Sends every reminder whose scheduled_for has arrived and that hasn't been sent
// yet, on the channels the customer has chosen (email by default; SMS when
// reminder_via_sms is on — the SMS sender is a stub until Task 13, so it no-ops
// today but the wiring is live). Opted-out customers have their due reminders
// stamped sent (so we stop scanning them) without a send. Push is deferred to
// the native app, so there's no push channel.
//
// Each reminder carries a unique token; the email/SMS CTA points at /r/<token>,
// which stamps acted_on_at (click-through tracking) and deep-links into booking.
//
// Protected by CRON_SECRET when set. Next API route + vercel.json cron, not a
// Supabase edge function (project convention — see schedule-reminders).

const BATCH = 200;

interface ReminderRow {
  id: string;
  customer_id: string | null;
  customer_email: string | null;
  vehicle_reg: string;
  reminder_type: ReminderType;
  token: string;
}

interface Prefs {
  name: string | null;
  enabled: boolean;
  viaEmail: boolean;
  viaSms: boolean;
  phone: string | null;
}

async function runSender() {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from("reminder_schedules")
    .select("id, customer_id, customer_email, vehicle_reg, reminder_type, token")
    .is("sent_at", null)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);

  if (!due?.length) return { sent: 0, skipped: 0 };

  // Batch-load preferences for the linked customers (guests use defaults).
  const customerIds = [...new Set((due as ReminderRow[]).map((r) => r.customer_id).filter(Boolean))] as string[];
  const prefsById = new Map<string, Prefs>();
  if (customerIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, phone, reminders_enabled, reminder_via_email, reminder_via_sms")
      .in("id", customerIds);
    for (const p of profiles ?? []) {
      prefsById.set(p.id, {
        name: p.full_name ?? null,
        enabled: p.reminders_enabled ?? true,
        viaEmail: p.reminder_via_email ?? true,
        viaSms: p.reminder_via_sms ?? false,
        phone: p.phone ?? null,
      });
    }
  }

  const preferencesUrl = `${siteUrl()}/dashboard/settings/reminders`;
  let sent = 0;
  let skipped = 0;

  for (const r of due as ReminderRow[]) {
    const prefs: Prefs = (r.customer_id && prefsById.get(r.customer_id)) || {
      name: null,
      enabled: true,
      viaEmail: true,
      viaSms: false,
      phone: null,
    };

    // Opted out → stamp sent (stop scanning) without delivering.
    if (!prefs.enabled) {
      await admin.from("reminder_schedules").update({ sent_at: nowIso }).eq("id", r.id);
      skipped += 1;
      continue;
    }

    const name = prefs.name ?? r.customer_email?.split("@")[0] ?? "there";
    const ctaUrl = `${siteUrl()}/r/${r.token}`;
    let delivered = false;

    if (prefs.viaEmail && r.customer_email) {
      try {
        const { subject, html } = await renderReminderEmail({
          type: r.reminder_type,
          name,
          vehicleReg: r.vehicle_reg,
          ctaUrl,
          preferencesUrl,
        });
        await sendEmail({ to: r.customer_email, subject, html });
        delivered = true;
      } catch (err) {
        console.error("reminder email failed", r.id, err);
      }
    }

    if (prefs.viaSms && prefs.phone) {
      // Stub until Task 13 — logs + returns false today.
      const ok = await sendSms({
        to: prefs.phone,
        body: `${REMINDER_META[r.reminder_type].label} for ${r.vehicle_reg}: ${REMINDER_META[r.reminder_type].cta} — ${ctaUrl}`,
      }).catch(() => false);
      delivered = delivered || ok;
    }

    // Stamp sent regardless of channel outcome so a hard-bouncing address can't
    // wedge the queue; a failed email is logged above for follow-up.
    await admin.from("reminder_schedules").update({ sent_at: nowIso }).eq("id", r.id);
    if (delivered) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped };
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
    const result = await runSender();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("send-reminders failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sender failed" },
      { status: 500 },
    );
  }
}
