import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { mechanicDocumentUrlFor } from "@/lib/mechanics/documents";

// GET /api/mobile/v1/mechanic/documents/[id]/url — open one of your own
// documents. AUTHENTICATED, mechanics only, and only the mechanic it belongs to.
//
// 200:  { url, expiresIn } — a signed URL into the private `mechanic-docs`
//       bucket, good for `expiresIn` seconds. The app opens it in the in-app
//       browser; it is not meant to be stored.
// 403:  someone else's document.   404: no such document.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The bucket has no browser grants at all, so this is the only way in for
// either client. Twin of `getMechanicDocumentUrl` (app/actions/documents.ts) —
// the website's version additionally lets an admin open anyone's, which this
// route never does: `isAdmin` is false, because the caller here is always
// acting as the mechanic whose app it is.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That document no longer exists.", 404);

  const result = await mechanicDocumentUrlFor(id, {
    userId: auth.caller.userId,
    isAdmin: false,
  });
  if (!result.ok) return refusalResponse("mechanic/documents/url", result);
  return apiOk({ url: result.url, expiresIn: result.expiresIn });
}
