"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mechanicDocumentUrlFor,
  uploadMechanicDocumentFor,
} from "@/lib/mechanics/documents";

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
 * admin to approve. The WEBSITE's entry point into the shared core
 * (lib/mechanics/documents.ts); POST /api/mobile/v1/mechanic/documents is the
 * mechanic app's, and both do the same writes through the service role.
 */
export async function uploadMechanicDocument(formData: FormData): Promise<DocumentsResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const result = await uploadMechanicDocumentFor(guard.mechanicId, {
    docType: String(formData.get("doc_type") ?? ""),
    file: formData.get("file"),
    expiresAt: String(formData.get("expires_at") ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.error };

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const result = await mechanicDocumentUrlFor(documentId, {
    userId: user.id,
    isAdmin: profile?.role === "admin",
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, url: result.url };
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
