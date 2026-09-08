import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import type { ChecklistItemRow, ChecklistRow } from "@/lib/checklists/checklists";

export const dynamic = "force-dynamic";

// The checklists a mechanic fills in on a service or inspection (Task 32).
// Seeded from Gareth's documents; editable here. A product (Services) links
// to one of these with a tier.

export default async function AdminChecklistsPage() {
  const supabase = await createClient();
  const [{ data: checklists, error }, { data: items }] = await Promise.all([
    supabase.from("checklists").select("id, key, name, kind").order("kind").order("name"),
    supabase.from("checklist_items").select("id, checklist_id, section, label, position, tiers, is_active"),
  ]);
  const rows = (checklists ?? []) as ChecklistRow[];
  const all = (items ?? []) as ChecklistItemRow[];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/services"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to services
        </Link>
      </div>
      <header>
        <Overline>Commercial · Services</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Checklists</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          What the mechanic ticks through on a service or inspection, and what the customer gets
          back as their report. A service item is Checked / N/A; an inspection item is Pass /
          Advisory / Fail / Not checked, and Bronze, Silver and Gold each cover a subset.
        </p>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load checklists: {error.message}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((c) => {
          const mine = all.filter((i) => i.checklist_id === c.id && i.is_active);
          const sections = new Set(mine.map((i) => i.section)).size;
          const tierCount = (t: string) => mine.filter((i) => i.tiers == null || i.tiers.includes(t)).length;
          return (
            <li key={c.id}>
              <Link href={`/admin/services/checklists/${c.id}`} className="block h-full">
                <Card className="flex h-full items-center justify-between gap-3 transition-colors hover:border-brand-blue/50">
                  <div className="min-w-0">
                    <p className="font-bold text-text-primary">{c.name}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {c.kind === "inspection"
                        ? `${mine.length} items in ${sections} sections · Bronze ${tierCount("bronze")} · Silver ${tierCount("silver")} · Gold ${tierCount("gold")}`
                        : `${mine.length} items · Checked / N/A`}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-text-muted" />
                </Card>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && !error && (
          <li className="text-sm text-text-muted">No checklists yet — apply migration 0061 to seed them.</li>
        )}
      </ul>
    </div>
  );
}
