import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { uploadMechanicDocumentFor } from "@/lib/mechanics/documents";
import { MAX_DOC_BYTES } from "@/lib/onboarding/docs";

// POST /api/mobile/v1/mechanic/documents — put a document on file.
// AUTHENTICATED, mechanics only.
//
// Body: multipart/form-data
//         doc_type    one of public_liability_insurance | trade_insurance |
//                     qualification | id | vat
//         file        PDF, JPG, PNG or WebP, 10 MB
//         expires_at  optional "YYYY-MM-DD"; empty means it doesn't expire
// 200:  { id } — the new row's id, so the app can show it straight away
//       without re-reading the list.
// 400:  no file, too big, a format we don't take, an unknown type, a date that
//       isn't one.   415: not multipart.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The LIST is a direct RLS read the app already does (0015). Only this write
// needs the server: `mechanic-docs` is a private bucket with no browser grants.
//
// A replacement is a NEW ROW, never an update — the newest row per `doc_type`
// is the current one and older rows are history. That is what lets an expired
// or rejected document be replaced, and it is what the grace sweep reads.
// It lands as `pending_review` for an admin to approve, same as the website.
//
// Twin of `uploadMechanicDocument` (app/actions/documents.ts); both run
// lib/mechanics/documents.ts.

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiError("Something went wrong. Please update the app and try again.", 415);
  }

  const auth = await mobileMechanicCaller(request, "mechanicupload");
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("We couldn't read that file. Please try again.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiError("No file selected.", 400);
  if (file.size > MAX_DOC_BYTES) return apiError("File must be 10 MB or smaller.", 400);

  const result = await uploadMechanicDocumentFor(auth.caller.userId, {
    docType: String(form.get("doc_type") ?? ""),
    file,
    expiresAt: String(form.get("expires_at") ?? ""),
  });
  if (!result.ok) return refusalResponse("mechanic/documents", result);
  return apiOk({ id: result.id });
}
