import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { MAX_PHOTO_BYTES } from "@/lib/disputes/core";
import { uploadCasePhotoFor } from "@/lib/resolutions/core";

// POST /api/mobile/v1/mechanic/cases/photos — store one photo as evidence for
// a Get-help case, get its URL back. AUTHENTICATED, mechanics only.
//
// Body: multipart/form-data with a single `file` part. JPG, PNG or WebP, 10 MB —
//       the same checks as a dispute photo, by the same function.
// 200:  { url }
// 400:  no file, too big, or not an image we take.   415: not multipart.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// UPLOAD FIRST, THEN RAISE THE CASE with the URLs in `photos`. The object lands
// under cases/<uploader>/ in `job-media`, and POST …/mechanic/cases keeps only
// URLs under the caller's own path.
//
// Why a server round-trip, and why no JSON content-type check: see
// app/api/mobile/v1/disputes/photos/route.ts.

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
    return apiError("We couldn't read that photo. Please try again.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiError("No photo selected.", 400);
  if (file.size > MAX_PHOTO_BYTES) return apiError("Photo must be 10 MB or smaller.", 400);

  const result = await uploadCasePhotoFor(file, auth.caller.userId);
  if (!result.ok) return refusalResponse("mechanic/cases/photos", result);
  return apiOk({ url: result.url });
}
