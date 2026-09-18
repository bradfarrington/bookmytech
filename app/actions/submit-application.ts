"use server";

import {
  submitApplicationFor,
  uploadApplicationDocFor,
} from "@/lib/applications/submit";
import type { DocType } from "@/lib/onboarding/docs";

// The WEBSITE's entry points into the application core (lib/applications/),
// used by the /mechanics/apply wizard. The mechanic app reaches the same core
// through POST /api/mobile/v1/applications/documents and
// POST /api/mobile/v1/applications (Task 71), so both clients store the same
// row, the same way, under the same rules.
//
// Anonymous by design — the applicant has no account yet — so there is no
// caller to resolve. Everything the core needs comes from the arguments.

export type UploadDocResult =
  | { ok: true; path: string; fileName: string }
  | { ok: false; error: string };

/** Upload one document under the wizard's client-generated draft id. */
export async function uploadApplicationDoc(
  draftId: string,
  docType: DocType,
  formData: FormData,
): Promise<UploadDocResult> {
  const result = await uploadApplicationDocFor(draftId, docType, formData.get("file"));
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, path: result.path, fileName: result.fileName };
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
  const { sourceAreaSlug, ...application } = input;
  const result = await submitApplicationFor(application, { sourceAreaSlug });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, applicationId: result.applicationId };
}
