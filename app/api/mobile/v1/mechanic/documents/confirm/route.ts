import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiOk, readJsonBody } from "@/lib/mobile/respond";
import { recordUploadedMechanicDocumentFor } from "@/lib/mechanics/documents";

// POST /api/mobile/v1/mechanic/documents/confirm — step 3: the file is in
// Storage, put it on file. AUTHENTICATED, mechanics only.
//
// Body: { doc_type, path, expires_at } — `path` exactly as …/upload-url
//       returned it; expires_at "YYYY-MM-DD" or empty for none.
// 200:  { id } — same as the multipart POST …/documents.
// 400:  over 25 MB, a format we don't take, not uploaded, a bad date — the
//       refused file is deleted.   403: a path that isn't this mechanic's.
//       Otherwise `{ error }`: 401, 429, 500.
//
// Counted on `mechanic` rather than `mechanicupload`: it moves no file, and
// counting it twice would halve the upload budget.

interface Body {
  doc_type?: unknown;
  path?: unknown;
  expires_at?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "mechanic");
  if (!auth.ok) return auth.response;

  const { doc_type, path, expires_at } = parsed.body;
  const result = await recordUploadedMechanicDocumentFor(auth.caller.userId, {
    docType: String(doc_type ?? ""),
    path: String(path ?? ""),
    expiresAt: typeof expires_at === "string" ? expires_at : null,
  });
  if (!result.ok) return refusalResponse("mechanic/documents/confirm", result);
  return apiOk({ id: result.id });
}
