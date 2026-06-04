"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import { renderAdminNewApplicationEmail } from "@/emails/admin-new-application";
import {
  ACCEPTED_DOC_MIME,
  DOC_BY_TYPE,
  MAX_DOC_BYTES,
  type DocType,
} from "@/lib/onboarding/docs";

const DOCS_BUCKET = "mechanic-docs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResubmitResult = { ok: true } | { ok: false; error: string };

// Resolve a needs_info application from its public resubmit token. Returns the
// row via service-role (the applicant has no session).
async function appFromToken(token: string) {
  if (!UUID_RE.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("mechanic_applications")
    .select("id, status, resubmit_token")
    .eq("resubmit_token", token)
    .single();
  if (!data || data.status !== "needs_info") return null;
  return { admin, app: data };
}

/** Re-upload one document against an existing needs_info application. */
export async function resubmitDoc(
  token: string,
  docType: DocType,
  formData: FormData,
): Promise<ResubmitResult> {
  if (!DOC_BY_TYPE[docType]) return { ok: false, error: "Unknown document type." };
  const found = await appFromToken(token);
  if (!found) return { ok: false, error: "This link is no longer valid." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No file selected." };
  if (file.size > MAX_DOC_BYTES)
    return { ok: false, error: "File must be 10 MB or smaller." };
  const ext = ACCEPTED_DOC_MIME[file.type];
  if (!ext) return { ok: false, error: "Use a PDF, JPG, PNG or WebP file." };

  const { admin, app } = found;
  const path = `applications/${app.id}/${docType}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: rowErr } = await admin
    .from("mechanic_applications")
    .update({ [DOC_BY_TYPE[docType].column]: path })
    .eq("id", app.id);
  if (rowErr) return { ok: false, error: rowErr.message };

  return { ok: true };
}

/** Mark the application resubmitted — back into the queue for re-review. */
export async function markResubmitted(token: string): Promise<ResubmitResult> {
  const found = await appFromToken(token);
  if (!found) return { ok: false, error: "This link is no longer valid." };
  const { admin, app } = found;

  const { data: full, error } = await admin
    .from("mechanic_applications")
    .update({ status: "submitted" })
    .eq("id", app.id)
    .select("full_name, postcode, specialisms")
    .single();
  if (error) return { ok: false, error: error.message };

  try {
    const adminTo = process.env.ADMIN_ALERT_EMAIL || "help@bookmytech.co.uk";
    const { subject, html } = await renderAdminNewApplicationEmail({
      applicantName: full.full_name,
      postcode: full.postcode,
      specialismCount: full.specialisms?.length ?? 0,
      reviewLink: `${siteUrl()}/admin/approvals?id=${app.id}`,
    });
    await sendEmail({ to: adminTo, subject, html });
  } catch (err) {
    console.error("markResubmitted: admin alert failed", err);
  }

  return { ok: true };
}
