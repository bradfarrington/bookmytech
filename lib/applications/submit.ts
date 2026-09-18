import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto/encrypt";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import { renderApplicationReceivedEmail } from "@/emails/application-received";
import { renderAdminNewApplicationEmail } from "@/emails/admin-new-application";
import { ACCEPTED_DOC_MIME, MAX_DOC_BYTES } from "@/lib/onboarding/docs";
import {
  DUPLICATE_APPLICATION_MESSAGE,
  applicationDocPath,
  isApplicationDocType,
  normaliseDraftId,
  refuseApplication,
  validateApplication,
  type ApplicationInput,
  type ApplicationRefusal,
} from "./validate";

// Applying to be a mechanic, shared by the website's wizard
// (app/actions/submit-application.ts) and the mechanic app
// (POST /api/mobile/v1/applications/documents and POST /api/mobile/v1/applications),
// Task 71. Same bucket, same paths, same row, same encryption, same emails —
// the two clients cannot drift because there is only one of each.
//
// Both halves are ANONYMOUS: the applicant has no account until an admin
// approves them, so there is no session to resolve and everything runs on the
// service role. The guards against abuse — a header that forces a CORS
// preflight, and per-IP limits — live in the mobile routes. The website's two
// server actions are NOT rate limited, as they weren't before Task 71: Next's
// Origin check stops a cross-site browser from calling them, but a script can.

const DOCS_BUCKET = "mechanic-docs";

export type UploadApplicationDocResult =
  | { ok: true; path: string; fileName: string }
  | ApplicationRefusal;

/**
 * Store one application document under the client-minted draft id, before the
 * application row exists. `upsert: true`, so replacing a document is the same
 * call and the path never changes. Orphaned uploads from abandoned drafts are
 * harmless; a path only means something once a submit records it — and a
 * submit only records paths under its own draft (./validate.ts).
 */
export async function uploadApplicationDocFor(
  draftIdRaw: unknown,
  docType: unknown,
  file: unknown,
): Promise<UploadApplicationDocResult> {
  const draftId = normaliseDraftId(draftIdRaw);
  if (!draftId) return refuseApplication("invalid", "Invalid draft.");
  if (!isApplicationDocType(docType)) return refuseApplication("invalid", "Unknown document type.");

  if (!(file instanceof File) || file.size === 0) return refuseApplication("invalid", "No file selected.");
  if (file.size > MAX_DOC_BYTES) return refuseApplication("invalid", "File must be 10 MB or smaller.");
  const ext = ACCEPTED_DOC_MIME[file.type];
  if (!ext) return refuseApplication("invalid", "Use a PDF, JPG, PNG or WebP file.");

  const admin = createAdminClient();
  const path = applicationDocPath(draftId, docType, ext);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) {
    // Storage's own wording is for us, not for an applicant.
    console.error("[applications/upload] storage write failed", path, error.message);
    return refuseApplication("failed", "We couldn't upload that file. Please try again.");
  }

  return { ok: true, path, fileName: file.name };
}

export type SubmitApplicationResult = { ok: true; applicationId: string } | ApplicationRefusal;

/**
 * Validate, store and announce an application. `sourceAreaSlug` is the web
 * wizard's recruitment-area tag (Task 10 Stage 3); the app never sends one.
 */
export async function submitApplicationFor(
  input: ApplicationInput,
  options: { sourceAreaSlug?: string | null } = {},
): Promise<SubmitApplicationResult> {
  const checked = validateApplication(input);
  if (!checked.ok) return checked;
  const a = checked.application;

  const admin = createAdminClient();

  let sourceAreaId: string | null = null;
  const slug = options.sourceAreaSlug?.trim().toLowerCase();
  if (slug) {
    const { data: area } = await admin.from("areas").select("id").eq("slug", slug).maybeSingle();
    sourceAreaId = area?.id ?? null;
  }

  const [ref1, ref2] = a.references;
  const { data: row, error } = await admin
    .from("mechanic_applications")
    .insert({
      email: a.email,
      full_name: a.fullName,
      source_area_id: sourceAreaId,
      phone: a.phone,
      postcode: a.postcode,
      years_experience: a.yearsExperience,
      business_type: a.businessType,
      business_name: a.businessName,
      business_number: a.businessNumber,
      vat_registered: a.vatRegistered,
      specialisms: a.specialisms,
      service_radius_miles: a.serviceRadiusMiles,
      doc_photo_id: a.docs.photo_id ?? null,
      doc_public_liability_insurance: a.docs.public_liability_insurance ?? null,
      doc_trade_insurance: a.docs.trade_insurance ?? null,
      doc_qualification: a.docs.qualification ?? null,
      doc_vat: a.docs.vat ?? null,
      bank_sort_code_encrypted: encrypt(a.sortCode),
      bank_account_number_encrypted: encrypt(a.accountNumber),
      reference_1_name: ref1.name,
      reference_1_relationship: ref1.relationship,
      reference_1_email: ref1.email,
      reference_1_phone: ref1.phone,
      reference_2_name: ref2.name,
      reference_2_relationship: ref2.relationship,
      reference_2_email: ref2.email,
      reference_2_phone: ref2.phone,
      status: "submitted",
    })
    .select("id")
    .single();

  if (error || !row) {
    if (error?.code === "23505" || error?.message.toLowerCase().includes("duplicate")) {
      return refuseApplication("conflict", DUPLICATE_APPLICATION_MESSAGE);
    }
    console.error("[applications/submit] insert failed", error?.message);
    return refuseApplication("failed", "We couldn't send your application just now. Please try again.");
  }

  // --- Notifications (a send failure must not fail the submit) --------------
  try {
    const { subject, html } = await renderApplicationReceivedEmail({ name: a.fullName });
    await sendEmail({ to: a.email, subject, html });
  } catch (err) {
    console.error("Failed to send application-received email", err);
  }

  try {
    const adminTo = process.env.ADMIN_ALERT_EMAIL || "support@bookmytech.co.uk";
    const { subject, html } = await renderAdminNewApplicationEmail({
      applicantName: a.fullName,
      postcode: a.postcode,
      specialismCount: a.specialisms.length,
      reviewLink: `${siteUrl()}/admin/approvals?id=${row.id}`,
    });
    await sendEmail({ to: adminTo, subject, html });
  } catch (err) {
    console.error("Failed to send admin new-application alert", err);
  }

  return { ok: true, applicationId: row.id as string };
}
