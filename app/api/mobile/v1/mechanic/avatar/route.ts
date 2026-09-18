import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { MAX_AVATAR_BYTES, uploadAvatarFor } from "@/lib/mechanics/avatar";

// POST /api/mobile/v1/mechanic/avatar — set your profile photo.
// AUTHENTICATED, mechanics only.
//
// Body: multipart/form-data with a single `avatar` part. JPG, PNG or WebP, 5 MB.
// 200:  { url } — already written to `profiles.avatar_url`, and already
//       cache-busted, so the app can show it immediately and customers see it
//       on the next job.
// 400:  no image, too big, or a format we don't take.   415: not multipart.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The app writes `full_name`, `phone`, `bio`, `service_radius_miles` and
// `specialisms` itself under RLS. Only the photo needs the server: the object
// path is namespaced by mechanic id and the `profiles` write goes with it, so
// nobody can put an image in anyone else's folder.
//
// Twin of `uploadAvatar` (app/actions/mechanic-profile.ts); both run
// lib/mechanics/avatar.ts.

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
    return apiError("We couldn't read that image. Please try again.", 400);
  }

  const file = form.get("avatar");
  if (!(file instanceof File)) return apiError("Choose an image to upload.", 400);
  if (file.size > MAX_AVATAR_BYTES) return apiError("Image must be 5 MB or smaller.", 400);

  const result = await uploadAvatarFor(auth.caller.userId, file);
  if (!result.ok) return refusalResponse("mechanic/avatar", result);
  return apiOk({ url: result.url });
}
