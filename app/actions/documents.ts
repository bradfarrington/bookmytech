"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCEPTED_DOC_MIME,
  MAX_DOC_BYTES,
  MECHANIC_DOC_LABEL,
  type MechanicDocType,
} from "@/lib/onboarding/docs";

const DOCS_BUCKET = "mechanic-docs";
const SIGNED_URL_TTL = 60 * 60;

export type DocumentsResult = { ok: true; url?: string } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, adminId: user.id };
}

/**
 * Mechanic uploads a replacement document. It enters 'pending_review' for an
 * admin to approve. Storage write goes through service-role (private bucket).
 */
export async function uploadMechanicDocument(formData: FormData): Promise<DocumentsResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const docType = String(formData.get("doc_type") ?? "") as MechanicDocType;
  if (!MECHANIC_DOC_LABEL[docType]) return { ok: false, error: "Choose a document type." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No file selected." };
  if (file.size > MAX_DOC_BYTES) return { ok: false, error: "File must be 10 MB or smaller." };
  const ext = ACCEPTED_DOC_MIME[file.type];
  if (!ext) return { ok: false, error: "Use a PDF, JPG, PNG or WebP file." };

  const expiresRaw = String(formData.get("expires_at") ?? "").trim();
  const expiresAt = expiresRaw || null;

  const admin = createAdminClient();
  const path = `documents/${guard.mechanicId}/${docType}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: rowErr } = await admin.from("mechanic_documents").insert({
    mechanic_id: guard.mechanicId,
    doc_type: docType,
    file_url: path,
    expires_at: expiresAt,
    status: "pending_review",
  });
  if (rowErr) return { ok: false, error: rowErr.message };

  revalidatePath("/mechanic/documents");
  revalidatePath("/admin/documents");
  return { ok: true };
}

/** Signed URL to view a document — mechanic (own) or admin. */
export async function getMechanicDocumentUrl(documentId: string): Promise<DocumentsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("mechanic_documents")
    .select("mechanic_id, file_url")
    .eq("id", documentId)
    .single();
  if (!doc) return { ok: false, error: "Document not found." };

  // Authorise: owner or admin.
  if (doc.mechanic_id !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") return { ok: false, error: "Not allowed." };
  }

  const { data, error } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(doc.file_url, SIGNED_URL_TTL);
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't open file." };
  return { ok: true, url: data.signedUrl };
}

/** Admin approves or rejects a pending replacement document. */
export async function reviewMechanicDocument(
  documentId: string,
  decision: "verified" | "rejected",
): Promise<DocumentsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (decision !== "verified" && decision !== "rejected")
    return { ok: false, error: "Invalid decision." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("mechanic_documents")
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: guard.adminId,
    })
    .eq("id", documentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/documents");
  revalidatePath("/mechanic/documents");
  return { ok: true };
}
