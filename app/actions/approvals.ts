"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import { renderApplicationApprovedEmail } from "@/emails/application-approved";
import { renderApplicationRejectedEmail } from "@/emails/application-rejected";
import { renderApplicationNeedsInfoEmail } from "@/emails/application-needs-info";

const DOCS_BUCKET = "mechanic-docs";
const SIGNED_URL_TTL = 60 * 60; // 1 hour, per spec
const GRACE_DAYS = 28;

export type ApprovalResult = { ok: true; url?: string } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin")
    return { ok: false as const, error: "Admins only." };
  return { ok: true as const, adminId: user.id };
}

const DOC_COLUMNS = new Set([
  "doc_photo_id",
  "doc_public_liability_insurance",
  "doc_trade_insurance",
  "doc_qualification",
  "doc_vat",
]);

/** Mint a 1-hour signed URL for one of an application's documents. */
export async function getDocumentUrl(
  applicationId: string,
  docColumn: string,
): Promise<ApprovalResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!DOC_COLUMNS.has(docColumn)) return { ok: false, error: "Unknown document." };

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("mechanic_applications")
    .select(docColumn)
    .eq("id", applicationId)
    .single();
  const path = (app as Record<string, string | null> | null)?.[docColumn];
  if (!path) return { ok: false, error: "No file on record for this item." };

  const { data, error } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't open file." };
  return { ok: true, url: data.signedUrl };
}

/** Persist (or clear) an admin's manual "verified" toggle on a checklist item. */
export async function toggleVerification(
  applicationId: string,
  key: string,
  verified: boolean,
): Promise<ApprovalResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("mechanic_applications")
    .select("verification")
    .eq("id", applicationId)
    .single();
  const verification = { ...((app?.verification as Record<string, boolean>) ?? {}) };
  if (verified) verification[key] = true;
  else delete verification[key];

  const { error } = await admin
    .from("mechanic_applications")
    .update({ verification })
    .eq("id", applicationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/approvals");
  return { ok: true };
}

/** Move a submitted application into the "under review" state. */
export async function markUnderReview(applicationId: string): Promise<ApprovalResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const admin = createAdminClient();
  const { error } = await admin
    .from("mechanic_applications")
    .update({ status: "under_review" })
    .eq("id", applicationId)
    .eq("status", "submitted");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/approvals");
  return { ok: true };
}

// Required documents whose absence is an "outstanding item" for grace approvals.
function outstandingItems(app: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (!app.doc_photo_id) out.push("Photo ID");
  if (!app.doc_public_liability_insurance) out.push("Public liability insurance");
  if (!app.doc_trade_insurance) out.push("Trade insurance");
  if (!app.doc_qualification) out.push("Trade qualification");
  if (app.vat_registered && !app.doc_vat) out.push("VAT registration document");
  return out;
}

// Shared: provision the mechanic account from an approved application and email
// a magic-link sign-in. Mirrors createMechanicAction (Task 04). Best-effort on
// the post-create steps so a Resend hiccup doesn't strand a created mechanic.
async function provisionMechanic(
  admin: ReturnType<typeof createAdminClient>,
  app: Record<string, unknown>,
  grace: { endsOn: string; outstanding: string[] } | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = String(app.email);
  const fullName = String(app.full_name);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? "Failed to create user.";
    return {
      ok: false,
      error: msg.toLowerCase().includes("registered")
        ? "A user with that email already exists."
        : msg,
    };
  }
  const userId = created.user.id;

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ role: "mechanic", full_name: fullName, phone: app.phone ?? null })
    .eq("id", userId);
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: `Couldn't set up profile: ${profileErr.message}` };
  }

  const { error: mechErr } = await admin.from("mechanics").insert({
    id: userId,
    base_postcode: app.postcode ?? null,
    service_radius_miles: app.service_radius_miles ?? 10,
    specialisms: app.specialisms ?? [],
    approved_at: new Date().toISOString(),
  });
  if (mechErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: `Couldn't create mechanic profile: ${mechErr.message}` };
  }

  // Seed the mechanic's documents from the application's uploads so the
  // /mechanic/documents + /admin/documents views aren't empty post-approval.
  // Already-reviewed, so status='verified'. Best-effort — a failure here (e.g.
  // 0015 not yet applied) must not strand an otherwise-approved mechanic.
  try {
    const docSeed: { column: string; docType: string }[] = [
      { column: "doc_photo_id", docType: "id" },
      { column: "doc_public_liability_insurance", docType: "public_liability_insurance" },
      { column: "doc_trade_insurance", docType: "trade_insurance" },
      { column: "doc_qualification", docType: "qualification" },
      { column: "doc_vat", docType: "vat" },
    ];
    const rows = docSeed
      .filter((d) => app[d.column])
      .map((d) => ({
        mechanic_id: userId,
        doc_type: d.docType,
        file_url: String(app[d.column]),
        status: "verified" as const,
        reviewed_at: new Date().toISOString(),
      }));
    if (rows.length) await admin.from("mechanic_documents").insert(rows);
  } catch (err) {
    console.error("approve: failed to seed mechanic_documents", err);
  }

  // Magic-link sign-in (token_hash → server callback), same as the invite flow.
  const base = siteUrl();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${base}/auth/callback?next=/mechanic` },
  });

  let actionLink = `${base}/mechanic`;
  if (!linkErr && linkData?.properties?.hashed_token) {
    actionLink = `${base}/auth/callback?token_hash=${encodeURIComponent(
      linkData.properties.hashed_token,
    )}&type=magiclink&next=/mechanic`;
  } else {
    console.error("approve: failed to generate magic link", linkErr);
  }

  try {
    const { subject, html } = await renderApplicationApprovedEmail({
      name: fullName,
      actionLink,
      grace,
    });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    console.error("approve: failed to send approval email", err);
  }

  return { ok: true };
}

/**
 * Approve an application. With `withGrace`, the mechanic goes live immediately
 * but has 28 days to supply outstanding docs (status='approved_with_grace').
 */
export async function approveApplication(
  applicationId: string,
  withGrace = false,
): Promise<ApprovalResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: app, error: readErr } = await admin
    .from("mechanic_applications")
    .select("*")
    .eq("id", applicationId)
    .single();
  if (readErr || !app) return { ok: false, error: "Application not found." };
  if (app.status === "approved" || app.status === "approved_with_grace")
    return { ok: false, error: "This application is already approved." };

  let grace: { endsOn: string; outstanding: string[] } | null = null;
  let gracePeriodEndsAt: string | null = null;
  if (withGrace) {
    const ends = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    gracePeriodEndsAt = ends.toISOString();
    grace = {
      endsOn: ends.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      outstanding: outstandingItems(app),
    };
  }

  const provisioned = await provisionMechanic(admin, app, grace);
  if (!provisioned.ok) return provisioned;

  const { error: updErr } = await admin
    .from("mechanic_applications")
    .update({
      status: withGrace ? "approved_with_grace" : "approved",
      grace_period_ends_at: gracePeriodEndsAt,
      reviewed_at: new Date().toISOString(),
      reviewed_by: guard.adminId,
    })
    .eq("id", applicationId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin/approvals");
  return { ok: true };
}

export async function rejectApplication(
  applicationId: string,
  reason: string,
): Promise<ApprovalResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, error: "A reason is required to reject." };

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("mechanic_applications")
    .select("email, full_name, status")
    .eq("id", applicationId)
    .single();
  if (!app) return { ok: false, error: "Application not found." };

  const { error } = await admin
    .from("mechanic_applications")
    .update({
      status: "rejected",
      rejection_reason: trimmed,
      reviewed_at: new Date().toISOString(),
      reviewed_by: guard.adminId,
    })
    .eq("id", applicationId);
  if (error) return { ok: false, error: error.message };

  try {
    const { subject, html } = await renderApplicationRejectedEmail({
      name: app.full_name,
      reason: trimmed,
    });
    await sendEmail({ to: app.email, subject, html });
  } catch (err) {
    console.error("reject: failed to send email", err);
  }

  revalidatePath("/admin/approvals");
  return { ok: true };
}

export async function requestInfo(
  applicationId: string,
  note: string,
): Promise<ApprovalResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const trimmed = note?.trim();
  if (!trimmed) return { ok: false, error: "Explain what's needed." };

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("mechanic_applications")
    .select("email, full_name, resubmit_token")
    .eq("id", applicationId)
    .single();
  if (!app) return { ok: false, error: "Application not found." };

  // Reuse an existing token if one was already issued, else mint one.
  const token = (app.resubmit_token as string | null) ?? crypto.randomUUID();

  const { error } = await admin
    .from("mechanic_applications")
    .update({
      status: "needs_info",
      needs_info_note: trimmed,
      resubmit_token: token,
      reviewed_at: new Date().toISOString(),
      reviewed_by: guard.adminId,
    })
    .eq("id", applicationId);
  if (error) return { ok: false, error: error.message };

  try {
    const { subject, html } = await renderApplicationNeedsInfoEmail({
      name: app.full_name,
      note: trimmed,
      resubmitLink: `${siteUrl()}/mechanics/resubmit/${token}`,
    });
    await sendEmail({ to: app.email, subject, html });
  } catch (err) {
    console.error("requestInfo: failed to send email", err);
  }

  revalidatePath("/admin/approvals");
  return { ok: true };
}
