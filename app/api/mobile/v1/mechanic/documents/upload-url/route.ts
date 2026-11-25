import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiOk, readJsonBody } from "@/lib/mobile/respond";
import { signMechanicDocumentUploadFor } from "@/lib/mechanics/documents";

// POST /api/mobile/v1/mechanic/documents/upload-url — step 1 of putting a
// document on file WITHOUT the file passing through here. AUTHENTICATED,
// mechanics only.
//
// Body: { doc_type, mime } — mime one of application/pdf, image/jpeg,
//       image/png, image/webp.
// 200:  { path, token } — upload the file with
//       `supabase.storage.from('mechanic-docs').uploadToSignedUrl(path, token, file)`,
//       then POST …/documents/confirm with the same path.
// 400:  unknown type or format.  Otherwise `{ error }`: 401, 403, 429, 500.
//
// Why not just POST the file to …/documents: Vercel refuses a request body over
// 4.5 MB before this code runs, and a scanned PDF is often bigger. See
// lib/storage/direct-doc-upload.ts. The multipart route stays for installed
// builds that still use it.

interface Body {
  doc_type?: unknown;
  mime?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "mechanicupload");
  if (!auth.ok) return auth.response;

  const result = await signMechanicDocumentUploadFor(auth.caller.userId, {
    docType: String(parsed.body.doc_type ?? ""),
    mime: String(parsed.body.mime ?? ""),
  });
  if (!result.ok) return refusalResponse("mechanic/documents/upload-url", result);
  return apiOk({ path: result.path, token: result.token });
}
