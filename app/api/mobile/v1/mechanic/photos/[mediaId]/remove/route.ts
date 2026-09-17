import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { deleteJobPhotoFor } from "@/lib/mechanics/job-media";

// POST /api/mobile/v1/mechanic/photos/[mediaId]/remove — delete a job photo
// the caller uploaded. AUTHENTICATED, mechanics only. The mobile twin of the
// website's `deleteJobPhoto()` (lib/mechanics/job-media.ts). POST, not DELETE,
// like every other removal in this API.
//
// No body.
// 200:  {}
// 403:  somebody else's photo.   404: no such photo.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { mediaId } = await params;
  if (!isUuid(mediaId)) return apiError("That photo no longer exists.", 404);

  const result = await deleteJobPhotoFor(auth.caller.userId, mediaId);
  if (!result.ok) return refusalResponse("mechanic/photos/remove", result);
  return apiOk({});
}
