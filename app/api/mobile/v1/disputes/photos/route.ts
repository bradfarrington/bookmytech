import { MAX_PHOTO_BYTES, uploadDisputePhotoFor } from "@/lib/disputes/core";
import { mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// POST /api/mobile/v1/disputes/photos — store one dispute photo, get its URL
// back. AUTHENTICATED.
//
// Body: multipart/form-data with a single `file` part. JPG, PNG or WebP, 10 MB
//       max. React Native's FormData takes `{ uri, name, type }` directly, so
//       the app appends the picker's asset without reading it into memory.
// 200:  { ok: true, url } | { ok: false, error }
//       Only transport-level problems return `{ error }` with a non-2xx: 401,
//       400/415 (not multipart, or no file part), 429.
//
// UPLOAD FIRST, THEN OPEN THE DISPUTE. The `url` comes back here and goes into
// the `photos` array on POST /bookings/:id/disputes. Nothing links a photo to a
// dispute until that call, so an abandoned upload is just an orphaned object.
//
// WHY A SERVER ROUND-TRIP rather than the app writing to Supabase Storage under
// RLS: `job-media` is a PUBLIC bucket whose uploads are service-role only
// (0011), and it holds every job's media. A bucket policy letting customers
// write to it directly would open all of that, not just a disputes/ prefix. So
// this endpoint is the narrow door: it checks the type and size, and keys the
// object path by the verified caller's id, so an object always records who put
// it there.
//
// The URL IS PUBLIC AND UNGUESSABLE-ISH, not secret — it's the same bucket the
// website's dispute form has always used, so this is no change in exposure. Don't
// put anything in a dispute photo you wouldn't hand to whoever has the link.
//
// NO `Content-Type: application/json` CHECK IS POSSIBLE HERE, and that's fine.
// That check exists on the JSON endpoints as a CSRF control: `application/json`
// isn't a CORS-simple type, so a cross-origin browser request carrying it gets
// preflighted and we answer no preflights. `multipart/form-data` IS simple, so
// the check can't apply. The Bearer requirement covers it instead — this route
// reads no cookies, so a page on another origin has no ambient credential to
// replay and would have to already hold the customer's access token, at which
// point it doesn't need this endpoint.

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiError("Something went wrong — please update the app and try again.", 415);
  }

  const auth = await mobileActionCaller(request, "upload");
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("We couldn't read that photo. Please try again.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiError("No photo selected.", 400);
  // Checked again in the core against the real byte length; this is only so an
  // obviously oversized upload is refused before we buffer it.
  if (file.size > MAX_PHOTO_BYTES) return apiError("Photo must be 10 MB or smaller.", 400);

  return apiOk(await uploadDisputePhotoFor(file, auth.caller.userId));
}
