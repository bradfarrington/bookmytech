import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import { applySuspension } from "@/lib/mechanics/suspend";
import { renderGracePeriodReminderEmail } from "@/emails/grace-period-reminder";
import { MECHANIC_DOC_LABEL, type MechanicDocType } from "@/lib/onboarding/docs";
import { daysUntil } from "@/lib/onboarding/expiry";

// Daily grace-period enforcement (Task 07 follow-up). Documents are no longer
// mandatory to submit an application; an admin approves "with 28-day grace" and
// the mechanic goes live with a deadline to supply outstanding docs. For every
// application still in that window (status='approved_with_grace', not yet
// enforced):
//   • all outstanding docs now supplied  → clear the grace (status='approved').
//   • deadline passed, docs still missing → suspend the mechanic (they stop
//     receiving jobs until an admin verifies the paperwork and lifts it).
//   • 14 / 7 / 1 days out, docs missing   → email a reminder.
//
// Each application is enforced exactly once past its deadline (grace_enforced_at
// stamp), so resolving/suspending never repeats. Reminder dedup relies on this
// running ~daily: each milestone (exact days-remaining) is hit on one calendar
// day. Protected by CRON_SECRET when set; open in local dev. Schedule via
// vercel.json.

const GRACE_REMINDER_DAYS = [14, 7, 1];

interface GraceApp {
  id: string;
  full_name: string | null;
  vat_registered: boolean;
  grace_period_ends_at: string | null;
  approved_mechanic_id: string;
}

function requiredDocTypes(vatRegistered: boolean): MechanicDocType[] {
  const base: MechanicDocType[] = [
    "id",
    "public_liability_insurance",
    "trade_insurance",
    "qualification",
  ];
  if (vatRegistered) base.push("vat");
  return base;
}

async function outstandingFor(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string,
  vatRegistered: boolean,
): Promise<MechanicDocType[]> {
  // A doc counts as supplied once it's on file — pending admin review still
  // counts, so a mechanic isn't punished for our verification backlog. Rejected
  // or expired docs don't count.
  const { data: docs } = await admin
    .from("mechanic_documents")
    .select("doc_type, status")
    .eq("mechanic_id", mechanicId)
    .in("status", ["verified", "pending_review"]);
  const supplied = new Set((docs ?? []).map((d) => d.doc_type as MechanicDocType));
  return requiredDocTypes(vatRegistered).filter((t) => !supplied.has(t));
}

async function runEnforcement() {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: apps } = await admin
    .from("mechanic_applications")
    .select("id, full_name, vat_registered, grace_period_ends_at, approved_mechanic_id")
    .eq("status", "approved_with_grace")
    .is("grace_enforced_at", null)
    .not("approved_mechanic_id", "is", null);

  if (!apps?.length) return { resolved: 0, suspended: 0, reminded: 0 };

  const documentsLink = `${siteUrl()}/mechanic/documents`;
  let resolved = 0;
  let suspended = 0;
  let reminded = 0;

  for (const app of apps as GraceApp[]) {
    const mechanicId = app.approved_mechanic_id;
    const outstanding = await outstandingFor(admin, mechanicId, app.vat_registered);

    // Everything supplied → grace fulfilled, promote to a plain approval.
    if (outstanding.length === 0) {
      await admin
        .from("mechanic_applications")
        .update({ status: "approved", grace_enforced_at: nowIso })
        .eq("id", app.id);
      resolved += 1;
      continue;
    }

    const days = app.grace_period_ends_at
      ? daysUntil(app.grace_period_ends_at.slice(0, 10))
      : null;
    const labels = outstanding.map((t) => MECHANIC_DOC_LABEL[t] ?? t);

    // Deadline passed with docs still missing → suspend (stops job offers).
    if (days != null && days < 0) {
      await applySuspension(
        admin,
        mechanicId,
        `28-day document grace period expired without the outstanding documents being supplied: ${labels.join(
          ", ",
        )}.`,
        null,
        null,
      );
      await admin
        .from("mechanic_applications")
        .update({ grace_enforced_at: nowIso })
        .eq("id", app.id);
      suspended += 1;
      continue;
    }

    // Still within the window → nudge at the milestone days.
    if (days != null && GRACE_REMINDER_DAYS.includes(days)) {
      const { data: userRes } = await admin.auth.admin.getUserById(mechanicId);
      const email = userRes.user?.email;
      if (email && app.grace_period_ends_at) {
        try {
          const { subject, html } = await renderGracePeriodReminderEmail({
            name: app.full_name ?? "there",
            daysRemaining: days,
            endsOn: new Date(app.grace_period_ends_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            outstanding: labels,
            documentsLink,
          });
          await sendEmail({ to: email, subject, html });
          reminded += 1;
        } catch (err) {
          console.error("grace reminder failed", err);
        }
      }
    }
  }

  return { resolved, suspended, reminded };
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
    const result = await runEnforcement();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("enforce-grace-periods failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "enforcement failed" },
      { status: 500 },
    );
  }
}
