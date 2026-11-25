import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";
import {
  ACCEPTED_DOC_MIME,
  MAX_DOC_BYTES,
  MECHANIC_DOC_LABEL,
  type MechanicDocType,
} from "@/lib/onboarding/docs";
import {
  UPLOAD_CHECK_MESSAGE,
  checkUploadedDoc,
  signDocUpload,
  type SignedDocUpload,
} from "@/lib/storage/direct-doc-upload";

// A mechanic's own documents, shared by the website's server actions
// (app/actions/documents.ts) and the mechanic app's route handlers
// (app/api/mobile/v1/mechanic/documents/*) — Task 70.
//
// The LIST is a direct read under RLS on both clients (0015 lets a mechanic
// select their own rows), so it isn't here. What is here is the two halves that
// need the service role: `mechanic-docs` is a PRIVATE bucket with no browser
// grants, so both the write and the signed read go through the admin client.
//
// Neither function resolves WHO the mechanic is — the caller does that, from a
// cookie session or a bearer token, and passes the id in.
//
// A replacement is a NEW ROW, never an update: `mechanic_documents` has no
// unique key on (mechanic_id, doc_type) and the object path carries a timestamp,
// so the newest row per type is the current one and older rows are history.
// That is what lets an expired or rejected document be replaced — the grace
// sweep counts a type as supplied the moment a `pending_review` row exists
// (app/api/cron/enforce-grace-periods).

const DOCS_BUCKET = "mechanic-docs";
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type DocumentUploadResult = { ok: true; id: string } | MechanicRefusal;
export type DocumentUrlResult =
  | { ok: true; url: string; expiresIn: number }
  | MechanicRefusal;

export interface DocumentUploadInput {
  docType: string;
  file: unknown;
  /** "YYYY-MM-DD", or empty/null for a document that doesn't expire. */
  expiresAt: string | null;
}

/**
 * Store a replacement document. It enters `pending_review` for an admin to
 * approve; the row's id comes back so the app can show it straight away.
 */
export async function uploadMechanicDocumentFor(
  mechanicId: string,
  input: DocumentUploadInput,
): Promise<DocumentUploadResult> {
  const docType = input.docType as MechanicDocType;
  if (!MECHANIC_DOC_LABEL[docType]) return refuse("invalid", "Choose a document type.");

  const file = input.file;
  if (!(file instanceof File) || file.size === 0) return refuse("invalid", "No file selected.");
  if (file.size > MAX_DOC_BYTES) return refuse("invalid", "File must be 10 MB or smaller.");
  const ext = ACCEPTED_DOC_MIME[file.type];
  if (!ext) return refuse("invalid", "Use a PDF, JPG, PNG or WebP file.");

  const expiresAt = parseExpiry(input.expiresAt);
  if (expiresAt === undefined) return refuse("invalid", "Enter the expiry date as a real date.");

  const admin = createAdminClient();
  const path = documentPath(mechanicId, docType, ext);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return refuse("failed", upErr.message);

  return insertDocumentRow(mechanicId, docType, path, expiresAt);
}

function documentPath(mechanicId: string, docType: MechanicDocType, ext: string): string {
  return `documents/${mechanicId}/${docType}-${Date.now()}.${ext}`;
}

/** The "YYYY-MM-DD" to store; null when blank (no expiry); undefined when it isn't a date. */
function parseExpiry(raw: string | null): string | null | undefined {
  const value = (raw ?? "").trim();
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

async function insertDocumentRow(
  mechanicId: string,
  docType: MechanicDocType,
  path: string,
  expiresAt: string | null,
): Promise<DocumentUploadResult> {
  const { data: row, error: rowErr } = await createAdminClient()
    .from("mechanic_documents")
    .insert({
      mechanic_id: mechanicId,
      doc_type: docType,
      file_url: path,
      expires_at: expiresAt,
      status: "pending_review",
    })
    .select("id")
    .single();
  if (rowErr || !row) return refuse("failed", rowErr?.message ?? "no row returned");

  return { ok: true, id: row.id as string };
}

// ---------------------------------------------------------------------------
// Direct-to-Storage uploads (lib/storage/direct-doc-upload.ts). Same rules and
// same row as `uploadMechanicDocumentFor`; the file just never passes through
// Vercel, so a document can be up to 25 MB rather than the 4.5 MB a request
// body is allowed there.
// ---------------------------------------------------------------------------

export type DocumentUploadSignResult = ({ ok: true } & SignedDocUpload) | MechanicRefusal;

/** Step 1: a one-time token to write this mechanic's next document of this type. */
export async function signMechanicDocumentUploadFor(
  mechanicId: string,
  input: { docType: string; mime: string },
): Promise<DocumentUploadSignResult> {
  const docType = input.docType as MechanicDocType;
  if (!MECHANIC_DOC_LABEL[docType]) return refuse("invalid", "Choose a document type.");
  const ext = ACCEPTED_DOC_MIME[input.mime];
  if (!ext) return refuse("invalid", "Use a PDF, JPG, PNG or WebP file.");

  const signed = await signDocUpload(documentPath(mechanicId, docType, ext), { upsert: false });
  if (!signed) return refuse("failed", "We couldn't start that upload. Please try again.");
  return { ok: true, ...signed };
}

/**
 * Step 3: the file is in Storage — check it and put it on file. The path must
 * be one step 1 could have issued to THIS mechanic for THIS type, or a crafted
 * call could file someone else's object as theirs.
 */
export async function recordUploadedMechanicDocumentFor(
  mechanicId: string,
  input: { docType: string; path: string; expiresAt: string | null },
): Promise<DocumentUploadResult> {
  const docType = input.docType as MechanicDocType;
  if (!MECHANIC_DOC_LABEL[docType]) return refuse("invalid", "Choose a document type.");

  const exts = Object.values(ACCEPTED_DOC_MIME).join("|");
  const own = new RegExp(`^documents/${mechanicId}/${docType}-\\d+\\.(${exts})$`);
  if (!own.test(input.path)) return refuse("forbidden", "That upload isn't yours.");

  const expiresAt = parseExpiry(input.expiresAt);
  if (expiresAt === undefined) return refuse("invalid", "Enter the expiry date as a real date.");

  const check = await checkUploadedDoc(input.path);
  if (!check.ok) return refuse("invalid", UPLOAD_CHECK_MESSAGE[check.reason]);

  return insertDocumentRow(mechanicId, docType, input.path, expiresAt);
}

export interface DocumentViewer {
  userId: string;
  /** True lets an admin open any mechanic's document, as the CRM does. */
  isAdmin: boolean;
}

/** A short-lived signed URL for one document — its owner, or an admin. */
export async function mechanicDocumentUrlFor(
  documentId: string,
  viewer: DocumentViewer,
): Promise<DocumentUrlResult> {
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("mechanic_documents")
    .select("mechanic_id, file_url")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return refuse("not_found", "That document no longer exists.");
  if (doc.mechanic_id !== viewer.userId && !viewer.isAdmin) {
    return refuse("forbidden", "This isn't your document.");
  }

  const { data, error } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(doc.file_url, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return refuse("failed", error?.message ?? "no signed url returned");
  return { ok: true, url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
}

/** Every object key this mechanic has in the private bucket (Task 70 deletion). */
export async function mechanicDocumentPaths(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("mechanic_documents")
    .select("file_url")
    .eq("mechanic_id", mechanicId);
  return (data ?? []).map((r) => r.file_url as string).filter(Boolean);
}

export const DOCS_BUCKET_NAME = DOCS_BUCKET;
