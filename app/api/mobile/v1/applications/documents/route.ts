import { apiError, apiOk } from "@/lib/mobile/respond";
import {
  applicationRefusalResponse,
  enforceApplicationDocLimits,
  requireAppClient,
} from "@/lib/mobile/application-guards";
import { uploadApplicationDocFor } from "@/lib/applications/submit";
import { MAX_DOC_BYTES } from "@/lib/onboarding/docs";

// POST /api/mobile/v1/applications/documents — upload one document for an
// application that hasn't been submitted yet. ANONYMOUS: the applicant has no
// account until an admin approves them.
//
// Headers: X-BMT-Client: mechanic-app — REQUIRED (400 without it). See
//          lib/mobile/application-guards.ts for why a header is the guard here.
// Body:    multipart/form-data
//            draftId  a UUID the app mints once per application and reuses for
//                     every upload and for the submit
//            docType  photo_id | public_liability_insurance | trade_insurance |
//                     qualification | vat
//            file     PDF, JPG, PNG or WebP, 10 MB
// 200:     { path } — "applications/<draftId>/<docType>.<ext>". Send it back in
//          the submit's `docs`, under the same type. Uploading the same type
//          again replaces the file.
// 400:     no header, bad draft id, unknown type, no file, too big, wrong format.
// 415:     not multipart.   429: past the IP limits.   500: storage failed.
//          All `{ error }`, written for the applicant.
//
// Twin of `uploadApplicationDoc` (app/actions/submit-application.ts); both run
// lib/applications/submit.ts.

export async function POST(request: Request): Promise<Response> {
  const noClient = requireAppClient(request);
  if (noClient) return noClient;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiError("Something went wrong. Please update the app and try again.", 415);
  }

  const limited = await enforceApplicationDocLimits(request);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("We couldn't read that file. Please try again.", 400);
  }

  const file = form.get("file");
  if (file instanceof File && file.size > MAX_DOC_BYTES) {
    return apiError("File must be 10 MB or smaller.", 400);
  }

  const result = await uploadApplicationDocFor(form.get("draftId"), form.get("docType"), file);
  if (!result.ok) return applicationRefusalResponse(result);
  return apiOk({ path: result.path });
}
