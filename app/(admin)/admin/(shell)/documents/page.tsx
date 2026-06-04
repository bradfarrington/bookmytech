import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import { DocumentsTable, type AdminDocRow } from "./_components/documents-table";

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage() {
  const supabase = await createClient();

  // Admins read all documents (0015). Join mechanic names from profiles (0006).
  const { data: docs } = await supabase
    .from("mechanic_documents")
    .select("id, mechanic_id, doc_type, status, expires_at, uploaded_at")
    .order("uploaded_at", { ascending: false });

  const mechanicIds = [...new Set((docs ?? []).map((d) => d.mechanic_id))];
  const { data: profiles } = mechanicIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", mechanicIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: AdminDocRow[] = (docs ?? []).map((d) => ({
    id: d.id,
    mechanicName: nameById.get(d.mechanic_id) ?? "Mechanic",
    docType: d.doc_type,
    status: d.status,
    expiresAt: d.expires_at,
    uploadedAt: d.uploaded_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Overline>Network</Overline>
        <h1 className="text-2xl font-extrabold text-text-primary">Documents</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Review replacement uploads and monitor expiring documents across the network.
        </p>
      </div>
      <DocumentsTable rows={rows} />
    </div>
  );
}
