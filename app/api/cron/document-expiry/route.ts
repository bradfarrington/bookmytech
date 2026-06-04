import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import { renderDocumentExpiryEmail } from "@/emails/document-expiry";
import {
  DISPATCH_GATING_DOC_TYPES,
  MECHANIC_DOC_LABEL,
  type MechanicDocType,
} from "@/lib/onboarding/docs";
import { daysUntil, REMINDER_DAYS } from "@/lib/onboarding/expiry";

// Daily document-expiry sweep (Task 07 Stage 3). For every verified mechanic
// document with an expiry date:
//   • 30 / 7 / 0 days before expiry → email the mechanic a reminder.
//   • once expired → mark the document 'expired', and if it's a dispatch-
//     gating type (insurance), take the mechanic offline so they receive no
//     new jobs until it's renewed.
//
// Reminder dedup relies on this running ~daily: each REMINDER_DAYS milestone
// (exact days-remaining) is hit on a single calendar day, so we never double-
// send without needing a per-reminder ledger column.
//
// Protected by CRON_SECRET when set; open in local dev so it can be curled.
// Schedule via vercel.json.

interface DocRow {
  id: string;
  mechanic_id: string;
  doc_type: MechanicDocType;
  expires_at: string | null;
  status: string;
}

async function runSweep() {
  const admin = createAdminClient();

  const { data: docs } = await admin
    .from("mechanic_documents")
    .select("id, mechanic_id, doc_type, expires_at, status")
    .eq("status", "verified")
    .not("expires_at", "is", null);

  if (!docs?.length) return { reminded: 0, expired: 0, takenOffline: 0 };

  // Resolve mechanic names/emails once.
  const mechanicIds = [...new Set(docs.map((d) => d.mechanic_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", mechanicIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "there"]));

  const emailById = new Map<string, string>();
  for (const id of mechanicIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emailById.set(id, data.user.email);
  }

  const documentsLink = `${siteUrl()}/mechanic/documents`;
  let reminded = 0;
  let expired = 0;
  const offlineMechanics = new Set<string>();

  for (const doc of docs as DocRow[]) {
    const remaining = daysUntil(doc.expires_at);
    if (remaining == null) continue;
    const label = MECHANIC_DOC_LABEL[doc.doc_type] ?? doc.doc_type;
    const email = emailById.get(doc.mechanic_id);
    const name = nameById.get(doc.mechanic_id) ?? "there";

    if (remaining < 0) {
      // Expired: flip status, gate dispatch if required.
      await admin.from("mechanic_documents").update({ status: "expired" }).eq("id", doc.id);
      expired += 1;
      if (DISPATCH_GATING_DOC_TYPES.includes(doc.doc_type)) {
        offlineMechanics.add(doc.mechanic_id);
      }
      if (email) {
        try {
          const { subject, html } = await renderDocumentExpiryEmail({
            name,
            docLabel: label,
            daysRemaining: remaining,
            documentsLink,
          });
          await sendEmail({ to: email, subject, html });
        } catch (err) {
          console.error("expiry email (expired) failed", err);
        }
      }
    } else if ((REMINDER_DAYS as readonly number[]).includes(remaining)) {
      if (email) {
        try {
          const { subject, html } = await renderDocumentExpiryEmail({
            name,
            docLabel: label,
            daysRemaining: remaining,
            documentsLink,
          });
          await sendEmail({ to: email, subject, html });
          reminded += 1;
        } catch (err) {
          console.error("expiry reminder failed", err);
        }
      }
    }
  }

  // Take affected mechanics offline (can't receive new jobs until docs current).
  for (const id of offlineMechanics) {
    await admin.from("mechanics").update({ status: "offline" }).eq("id", id);
  }

  return { reminded, expired, takenOffline: offlineMechanics.size };
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
    console.error("document-expiry sweep failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sweep failed" },
      { status: 500 },
    );
  }
}
