import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCEPTED_DOC_MIME } from "@/lib/onboarding/docs";

// Documents that go from the mechanic app STRAIGHT to Supabase Storage, rather
// than through a route here.
//
// Why: every request to this app runs on Vercel, which refuses a body over
// 4.5 MB before our code sees it — whatever limit a route sets. A scanned
// insurance certificate or a multi-page PDF is routinely bigger than that, and
// on Android the refusal surfaces as a dropped connection, not an error. Photos
// are shrunk on the phone; a PDF can't be.
//
// So the upload is three calls, and only the small two come here:
//   1. sign    — we pick the path and hand back a one-time signed upload token
//                for exactly that object (`createSignedUploadUrl`);
//   2. upload  — the app PUTs the file to Storage with that token;
//   3. confirm — we read what actually landed (`info()`: the size Storage
//                measured, the type it was sent as) and only then record it.
//                Anything over the cap or of a type we don't take is deleted
//                rather than left in the bucket.
//
// The cap here is 25 MB, not the 10 MB `MAX_DOC_BYTES` the multipart routes and
// the website use. 10 MB was only ever about request bodies; this path has
// none, and a PDF can't be shrunk on the phone the way a photo is (and there is
// no way to compress one here without sending ID and insurance documents to a
// third party). 25 MB fits virtually any real scan; Storage's own project limit
// is above it.
//
// The signed token is the only grant: `mechanic-docs` stays private with no
// browser policies, and the token can write that one path and nothing else.

const DOCS_BUCKET = "mechanic-docs";

/** The most a directly uploaded document may be. Mirrored in the mechanic app. */
export const MAX_DIRECT_DOC_BYTES = 25 * 1024 * 1024;

export interface SignedDocUpload {
  /** The object key the app must send back on confirm. */
  path: string;
  /** For `storage.from('mechanic-docs').uploadToSignedUrl(path, token, …)`. */
  token: string;
}

export async function signDocUpload(
  path: string,
  { upsert }: { upsert: boolean },
): Promise<SignedDocUpload | null> {
  const { data, error } = await createAdminClient()
    .storage.from(DOCS_BUCKET)
    .createSignedUploadUrl(path, { upsert });
  if (error || !data) {
    console.error("[direct-doc-upload] could not sign", path, error?.message);
    return null;
  }
  return { path: data.path, token: data.token };
}

export type UploadedDocCheck =
  | { ok: true; mime: string }
  | { ok: false; reason: "missing" | "too_big" | "wrong_type" };

/**
 * What landed at `path` — and whether it is something we keep. A file that
 * breaks the rules is removed here, so the caller only has to refuse.
 *
 * The extension in the path was fixed by us at sign time from the type the app
 * declared; the stored type must still match it, so a "PDF" that arrived as
 * something else is caught.
 */
export async function checkUploadedDoc(path: string): Promise<UploadedDocCheck> {
  const bucket = createAdminClient().storage.from(DOCS_BUCKET);
  const { data, error } = await bucket.info(path);
  if (error || !data) return { ok: false, reason: "missing" };

  const size = data.size ?? 0;
  const mime = (data.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = path.slice(path.lastIndexOf(".") + 1);

  const reason =
    size === 0
      ? ("missing" as const)
      : size > MAX_DIRECT_DOC_BYTES
        ? ("too_big" as const)
        : ACCEPTED_DOC_MIME[mime] !== ext
          ? ("wrong_type" as const)
          : null;
  if (!reason) return { ok: true, mime };

  const { error: removeError } = await bucket.remove([path]);
  if (removeError) {
    console.error("[direct-doc-upload] could not remove a refused upload", path, removeError.message);
  }
  return { ok: false, reason };
}

/** The applicant- and mechanic-facing wording for a refused upload. */
export const UPLOAD_CHECK_MESSAGE: Record<Exclude<UploadedDocCheck, { ok: true }>["reason"], string> = {
  missing: "That file didn't finish uploading. Please try again.",
  too_big: "This file is over 25 MB. Please compress it and try again.",
  wrong_type: "Use a PDF, JPG, PNG or WebP file.",
};
