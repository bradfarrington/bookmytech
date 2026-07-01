import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReasonsEditor, type ReasonRow } from "./_components/reasons-editor";

export const dynamic = "force-dynamic";

export default async function ResolutionReasonsPage() {
  // Service-role read so inactive (soft-deleted) reasons are shown too — the
  // RLS SELECT policy only exposes active-relevant rows to normal sessions, and
  // admins manage the full list here.
  const admin = createAdminClient();
  const { data } = await admin
    .from("resolution_reasons")
    .select("id, label, active, sort_order")
    .order("sort_order", { ascending: true });

  const reasons: ReasonRow[] = (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    active: r.active,
    sortOrder: r.sort_order,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/resolutions"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to Resolution Center
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Resolution reasons</h1>
        <p className="mt-1 text-sm text-text-muted">
          These are the reasons mechanics and admins pick from when raising a case. Inactive reasons
          stay on past cases but are hidden from the dropdown.
        </p>
      </div>
      <ReasonsEditor initialReasons={reasons} />
    </div>
  );
}
