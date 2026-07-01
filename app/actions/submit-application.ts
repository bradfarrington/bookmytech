"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto/encrypt";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import { renderApplicationReceivedEmail } from "@/emails/application-received";
import { renderAdminNewApplicationEmail } from "@/emails/admin-new-application";
import {
  ACCEPTED_DOC_MIME,
  DOC_BY_TYPE,
  MAX_DOC_BYTES,
  type DocType,
} from "@/lib/onboarding/docs";

const DOCS_BUCKET = "mechanic-docs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?(\s?[0-9][A-Z]{2})?$/i;
const SORT_CODE_RE = /^\d{6}$/;
const ACCOUNT_RE = /^\d{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadDocResult =
  | { ok: true; path: string; fileName: string }
  | { ok: false; error: string };

/**
 * Upload a single application document to the private `mechanic-docs` bucket
 * under the wizard's client-generated draft id. Called as the applicant picks
 * each file, before the application row exists — so it runs under the
 * service-role client (there's no session). Orphaned uploads from abandoned
 * drafts are harmless; the path only becomes meaningful once submit() records
 * it on the row.
 */
export async function uploadApplicationDoc(
  draftId: string,
  docType: DocType,
  formData: FormData,
): Promise<UploadDocResult> {
  if (!UUID_RE.test(draftId)) return { ok: false, error: "Invalid draft." };
  if (!DOC_BY_TYPE[docType]) return { ok: false, error: "Unknown document type." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No file selected." };
  if (file.size > MAX_DOC_BYTES)
    return { ok: false, error: "File must be 10 MB or smaller." };
  const ext = ACCEPTED_DOC_MIME[file.type];
  if (!ext) return { ok: false, error: "Use a PDF, JPG, PNG or WebP file." };

  const admin = createAdminClient();
  const path = `applications/${draftId}/${docType}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) return { ok: false, error: error.message };

  return { ok: true, path, fileName: file.name };
}

export interface ApplicationReference {
  name: string;
  relationship: string;
  email: string;
  phone: string;
}

export interface SubmitApplicationInput {
  draftId: string;
  // Step 1
  fullName: string;
  email: string;
  phone: string;
  postcode: string;
  yearsExperience: string;
  // Step 2
  businessType: "" | "sole_trader" | "limited_company";
  businessName: string;
  businessNumber: string;
  vatRegistered: boolean;
  // Step 3
  specialisms: string[];
  serviceRadiusMiles: number;
  // Step 4 — storage object keys returned by uploadApplicationDoc
  docs: Partial<Record<DocType, string>>;
  bankSortCode: string;
  bankAccountNumber: string;
  references: [ApplicationReference, ApplicationReference];
  /** Slug of the recruitment area the applicant came from (Task 10 Stage 3). */
  sourceAreaSlug?: string;
}

export type SubmitApplicationResult =
  | { ok: true; applicationId: string }
  | { ok: false; error: string };

export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<SubmitApplicationResult> {
  // --- Server-side validation (the client gates each step, but never trust it) ---
  const fullName = input.fullName?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();
  const postcode = input.postcode?.trim().toUpperCase();

  if (!fullName) return { ok: false, error: "Full name is required." };
  if (!email || !EMAIL_RE.test(email))
    return { ok: false, error: "Enter a valid email address." };
  if (!phone) return { ok: false, error: "Phone number is required." };
  if (!postcode || !POSTCODE_RE.test(postcode))
    return { ok: false, error: "Enter a valid UK postcode." };

  if (input.businessType && input.businessType !== "sole_trader" && input.businessType !== "limited_company")
    return { ok: false, error: "Choose a valid business type." };

  const radius = Number(input.serviceRadiusMiles);
  if (!Number.isFinite(radius) || radius < 1 || radius > 100)
    return { ok: false, error: "Service radius must be between 1 and 100 miles." };

  const sortCode = input.bankSortCode?.replace(/[\s-]/g, "") ?? "";
  const accountNumber = input.bankAccountNumber?.replace(/\s/g, "") ?? "";
  if (!SORT_CODE_RE.test(sortCode))
    return { ok: false, error: "Sort code must be 6 digits." };
  if (!ACCOUNT_RE.test(accountNumber))
    return { ok: false, error: "Account number must be 8 digits." };

  // References and documents are deliberately NOT required to submit. References
  // are optional entirely; documents can be supplied later under the 28-day
  // grace period an admin grants at approval. We still store whatever the
  // applicant did provide.

  const years = input.yearsExperience?.trim()
    ? Number.parseInt(input.yearsExperience, 10)
    : null;

  const admin = createAdminClient();

  // Resolve the originating recruitment area (if any) to an id for tagging.
  let sourceAreaId: string | null = null;
  if (input.sourceAreaSlug) {
    const { data: area } = await admin
      .from("areas")
      .select("id")
      .eq("slug", input.sourceAreaSlug.trim().toLowerCase())
      .maybeSingle();
    sourceAreaId = area?.id ?? null;
  }

  const { data: row, error } = await admin
    .from("mechanic_applications")
    .insert({
      email,
      full_name: fullName,
      source_area_id: sourceAreaId,
      phone,
      postcode,
      years_experience: Number.isFinite(years as number) ? years : null,
      business_type: input.businessType || null,
      business_name: input.businessName?.trim() || null,
      business_number: input.businessNumber?.trim() || null,
      vat_registered: input.vatRegistered,
      specialisms: input.specialisms ?? [],
      service_radius_miles: radius,
      doc_photo_id: input.docs.photo_id ?? null,
      doc_public_liability_insurance: input.docs.public_liability_insurance ?? null,
      doc_trade_insurance: input.docs.trade_insurance ?? null,
      doc_qualification: input.docs.qualification ?? null,
      doc_vat: input.docs.vat ?? null,
      bank_sort_code_encrypted: encrypt(sortCode),
      bank_account_number_encrypted: encrypt(accountNumber),
      reference_1_name: input.references[0]?.name?.trim() || null,
      reference_1_relationship: input.references[0]?.relationship?.trim() || null,
      reference_1_email: input.references[0]?.email?.trim().toLowerCase() || null,
      reference_1_phone: input.references[0]?.phone?.trim() || null,
      reference_2_name: input.references[1]?.name?.trim() || null,
      reference_2_relationship: input.references[1]?.relationship?.trim() || null,
      reference_2_email: input.references[1]?.email?.trim().toLowerCase() || null,
      reference_2_phone: input.references[1]?.phone?.trim() || null,
      status: "submitted",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate"))
      return { ok: false, error: "An application with that email already exists." };
    return { ok: false, error: error.message };
  }

  // --- Notifications (fire-and-forget; a send failure must not fail submit) ---
  try {
    const { subject, html } = await renderApplicationReceivedEmail({ name: fullName });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    console.error("Failed to send application-received email", err);
  }

  try {
    const adminTo = process.env.ADMIN_ALERT_EMAIL || "help@bookmytech.co.uk";
    const { subject, html } = await renderAdminNewApplicationEmail({
      applicantName: fullName,
      postcode,
      specialismCount: input.specialisms?.length ?? 0,
      reviewLink: `${siteUrl()}/admin/approvals?id=${row.id}`,
    });
    await sendEmail({ to: adminTo, subject, html });
  } catch (err) {
    console.error("Failed to send admin new-application alert", err);
  }

  return { ok: true, applicationId: row.id };
}
