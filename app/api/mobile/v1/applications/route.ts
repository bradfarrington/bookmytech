import { apiOk, readJsonBody } from "@/lib/mobile/respond";
import {
  applicationRefusalResponse,
  enforceApplicationSubmitLimits,
} from "@/lib/mobile/application-guards";
import { submitApplicationFor } from "@/lib/applications/submit";
import type { ApplicationInput } from "@/lib/applications/validate";

// POST /api/mobile/v1/applications — apply to be a mechanic. ANONYMOUS: the
// applicant has no account until an admin approves them.
//
// Body (JSON):
//   { draftId, fullName, email, phone, postcode,
//     yearsExperience: number | null,            // 0–70
//     businessType: "sole_trader" | "limited_company",
//     businessName, businessNumber,              // both required
//     vatRegistered: boolean,
//     specialisms: string[],                     // ≥1, slugs from lib/specialisms.ts
//     serviceRadiusMiles: number,                // 1–100
//     docs: { [docType]: path },                 // only those uploaded
//     bankSortCode, bankAccountNumber,           // 6 and 8 digits
//     references: [{ name, relationship, email, phone }, { … }] }
//
// 201:  { applicationId } — the row is in the admin approvals queue, and the
//       applicant and the ops inbox have both been emailed.
// 400:  the first rule the application breaks, as a sentence.
//       Every `docs` path must be this draft's own upload of that type
//       (`applications/<draftId>/<docType>.<ext>`), and `vat` only when
//       `vatRegistered` — so a submit can never point at someone else's file.
// 409:  an application with that email already exists. The sentence says to
//       email support, because the address never frees up.
// 415/400: not JSON.   429: past the IP limits.   500: the insert failed.
//       All `{ error }`, written for the applicant.
//
// No `X-BMT-Client` requirement here: `readJsonBody` insists on
// application/json, which forces a CORS preflight on its own.
//
// Twin of `submitApplication` (app/actions/submit-application.ts); both run
// lib/applications/submit.ts. The app sends no `sourceAreaSlug`.

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<ApplicationInput>(request);
  if (!parsed.ok) return parsed.response;

  const limited = await enforceApplicationSubmitLimits(request);
  if (limited) return limited;

  // Every field is read as `unknown` and checked by the core; nothing here
  // trusts the body's shape.
  const b = parsed.body;
  const result = await submitApplicationFor({
    draftId: b.draftId,
    fullName: b.fullName,
    email: b.email,
    phone: b.phone,
    postcode: b.postcode,
    yearsExperience: b.yearsExperience,
    businessType: b.businessType,
    businessName: b.businessName,
    businessNumber: b.businessNumber,
    vatRegistered: b.vatRegistered,
    specialisms: b.specialisms,
    serviceRadiusMiles: b.serviceRadiusMiles,
    docs: b.docs,
    bankSortCode: b.bankSortCode,
    bankAccountNumber: b.bankAccountNumber,
    references: b.references,
  });
  if (!result.ok) return applicationRefusalResponse(result);
  return apiOk({ applicationId: result.applicationId }, 201);
}
