import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { MAX_PHOTO_BYTES, uploadDisputePhotoFor } from "@/lib/disputes/core";

// POST /api/mobile/v1/mechanic/disputes/photos — store one dispute photo, get
// its URL back. AUTHENTICATED, mechanics only. The mechanic twin of
// POST /api/mobile/v1/disputes/photos, over the same `uploadDisputePhotoFor`.
//
// Body: multipart/form-data with a single `file` part. JPG, PNG or WebP, 10 MB.
// 200:  { url }
// 400:  no file, too big, or not an image we take.   415: not multipart.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// UPLOAD FIRST, THEN SEND. The `url` goes into `photos` when opening a dispute
// or replying in one. The object's path records who uploaded it, and those two
// routes keep only URLs under the caller's own path — so a photo can't be
// passed off as somebody else's, or point somewhere else entirely.
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

  const result = await uploadDisputePhotoFor(file, auth.caller.userId);
  if (!result.ok) return refusalResponse("mechanic/disputes/photos", result);
  return apiOk({ url: result.url });
}
