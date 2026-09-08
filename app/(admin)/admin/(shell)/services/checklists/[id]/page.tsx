import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { groupBySection, type ChecklistItemRow, type ChecklistRow } from "@/lib/checklists/checklists";
import { ChecklistEditor } from "../_components/checklist-editor";

export const dynamic = "force-dynamic";

export default async function AdminChecklistEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: checklist }, { data: items }] = await Promise.all([
    supabase.from("checklists").select("id, key, name, kind").eq("id", id).maybeSingle(),
    supabase
      .from("checklist_items")
      .select("id, checklist_id, section, label, position, tiers, is_active")
      .eq("checklist_id", id)
      .order("position"),
  ]);
  if (!checklist) notFound();
  const rows = (items ?? []) as ChecklistItemRow[];
  const sections = groupBySection(rows);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/services/checklists"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to checklists
        </Link>
      </div>
      <header>
        <Overline>Services · Checklists</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">{checklist.name}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          {checklist.kind === "inspection"
            ? "Tick which tiers each item belongs to. An item switched off stays on reports already written."
            : "Rename, reorder, add or switch off items. An item switched off stays on reports already written."}
        </p>
      </header>
      <ChecklistEditor checklist={checklist as ChecklistRow} sections={sections} />
    </div>
  );
}
