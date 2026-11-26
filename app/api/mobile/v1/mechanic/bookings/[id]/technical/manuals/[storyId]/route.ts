import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { jobManualFor } from "@/lib/mechanics/technical-data";

// GET /api/mobile/v1/mechanic/bookings/[id]/technical/manuals/[storyId] — one
// repair manual for THIS job's vehicle (Task 86). AUTHENTICATED, mechanics
// only, and only the mechanic the booking is assigned to.
//
// 200:  { name, lines }
//       · lines  [{ name, text, remark, imageUrl, lines }], nested to any
//                depth. `imageUrl` is an absolute JPEG or SVGZ URL on
//                haynespro-assets.com, or null.
// 403:  not this mechanic's job.
// 404:  no such job, the vehicle has no manufacturer data, or no such manual.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; storyId: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id, storyId } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);
  const story = Number(storyId);
  if (!/^\d+$/.test(storyId) || !Number.isSafeInteger(story) || story <= 0) {
    return apiError("Couldn't load this manual.", 404);
  }

  try {
    const result = await jobManualFor(auth.caller.userId, id, story);
    if (!result.ok) return refusalResponse("mechanic/technical/manual", result);
    return apiOk({ name: result.name, lines: result.lines });
  } catch (err) {
    console.error("[mechanic/technical/manual] failed", err);
    return apiError("We couldn't load this manual. Please try again in a moment.", 500);
  }
}
