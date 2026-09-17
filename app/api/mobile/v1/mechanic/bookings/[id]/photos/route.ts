import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { MAX_JOB_PHOTO_BYTES, uploadJobPhotoFor } from "@/lib/mechanics/job-media";

// POST /api/mobile/v1/mechanic/bookings/[id]/photos — add one photo to a job.
// AUTHENTICATED, mechanics only. The mobile twin of the website's
// `uploadJobPhoto()` (lib/mechanics/job-media.ts): same types, same size, same
// status gate, same `booking_media` row.
//
// Body: multipart/form-data with a single `file` part. JPG, PNG or WebP, 10 MB
//       max. React Native's FormData takes `{ uri, name, type }` directly.
// 200:  { id, url } — `id` is the `booking_media` row (for …/photos/<id>/remove),
//       `url` the public address of the image.
// 400:  no file, too big, or not an image we take.   415: not multipart.
// 409:  the job isn't active (confirmed, en route or in progress).
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// A SERVER ROUND-TRIP, not a direct Storage write, and no JSON content-type
// check — both for the reasons set out in
// app/api/mobile/v1/disputes/photos/route.ts. The URL is public and
// unguessable-ish, not secret, like every other object in `job-media`.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiError("Something went wrong. Please update the app and try again.", 415);
  }

  const auth = await mobileMechanicCaller(request, "mechanicupload");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("We couldn't read that photo. Please try again.", 400);
  }

  const file = form.get("file");
  // Checked again in the core; this is only so an obviously oversized upload is
  // refused with the right sentence before anything else looks at it.
  if (file instanceof File && file.size > MAX_JOB_PHOTO_BYTES) {
    return apiError("Photo must be 10 MB or smaller.", 400);
  }

  const result = await uploadJobPhotoFor(auth.caller.userId, id, file);
  if (!result.ok) return refusalResponse("mechanic/photos", result);
  return apiOk({ id: result.id, url: result.url });
}
