import { apiOk, readJsonBody } from "@/lib/mobile/respond";
import { applicationRefusalResponse, requireAppClient } from "@/lib/mobile/application-guards";
import { confirmApplicationDocFor } from "@/lib/applications/submit";

// POST /api/mobile/v1/applications/documents/confirm — step 3: check the file
// that landed in Storage. ANONYMOUS.
//
// Headers: X-BMT-Client: mechanic-app — REQUIRED.
// Body:    { draftId, docType, path } — path exactly as …/upload-url returned.
// 200:     { path } — send it in the submit's `docs`, as with the multipart route.
// 400:     over 10 MB, wrong format, not uploaded, or not this draft's path;
//          a refused file is deleted.
//
// Not rate limited on its own: it moves no file, reads one object's metadata,
// and can only touch a path belonging to the draft id it is given. The signing
// step it follows is limited.

interface Body {
  draftId?: unknown;
  docType?: unknown;
  path?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const noClient = requireAppClient(request);
  if (noClient) return noClient;

  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const { draftId, docType, path } = parsed.body;
  const result = await confirmApplicationDocFor(draftId, docType, path);
  if (!result.ok) return applicationRefusalResponse(result);
  return apiOk({ path: result.path });
}
