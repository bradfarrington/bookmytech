import { apiOk, readJsonBody } from "@/lib/mobile/respond";
import {
  applicationRefusalResponse,
  enforceApplicationDocLimits,
  requireAppClient,
} from "@/lib/mobile/application-guards";
import { signApplicationDocUploadFor } from "@/lib/applications/submit";

// POST /api/mobile/v1/applications/documents/upload-url — step 1 of uploading
// an application document straight to Storage. ANONYMOUS.
//
// Headers: X-BMT-Client: mechanic-app — REQUIRED.
// Body:    { draftId, docType, mime }
// 200:     { path, token } — upload with
//          `supabase.storage.from('mechanic-docs').uploadToSignedUrl(path, token, file)`,
//          then POST …/documents/confirm.
// 400:     no header, bad draft id, unknown type or format.   429.   500.
//
// Counted against the same per-IP document limits as the multipart route
// (POST …/applications/documents), which stays for installed builds. Why this
// exists: lib/storage/direct-doc-upload.ts.

interface Body {
  draftId?: unknown;
  docType?: unknown;
  mime?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const noClient = requireAppClient(request);
  if (noClient) return noClient;

  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const limited = await enforceApplicationDocLimits(request);
  if (limited) return limited;

  const { draftId, docType, mime } = parsed.body;
  const result = await signApplicationDocUploadFor(draftId, docType, mime);
  if (!result.ok) return applicationRefusalResponse(result);
  return apiOk({ path: result.path, token: result.token });
}
