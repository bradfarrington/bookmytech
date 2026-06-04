import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import { DocumentsManager, type DocItem } from "./_components/documents-manager";

export const dynamic = "force-dynamic";

export default async function MechanicDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to the mechanic's own documents (0015).
  const { data: rows } = await supabase
    .from("mechanic_documents")
    .select("id, doc_type, status, expires_at, uploaded_at")
    .eq("mechanic_id", user.id)
    .order("uploaded_at", { ascending: false });

  const documents: DocItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    docType: r.doc_type,
    status: r.status,
    expiresAt: r.expires_at,
    uploadedAt: r.uploaded_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Overline>Your account</Overline>
        <h1 className="text-2xl font-extrabold text-text-primary">Documents</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Keep your insurance and qualifications up to date to stay eligible for jobs.
        </p>
      </div>
      <DocumentsManager documents={documents} />
    </div>
  );
}
