"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InlineName } from "@/app/(admin)/admin/(shell)/repairs/_components/inline-name";
import { useCatalogueAction } from "@/app/(admin)/admin/(shell)/repairs/_components/use-catalogue-action";
import { CHECKLIST_TIERS, type ChecklistRow, type ChecklistSection } from "@/lib/checklists/checklists";
import {
  addChecklistItem,
  moveChecklistItem,
  renameChecklist,
  renameChecklistItem,
  renameChecklistSection,
  setChecklistItemActive,
  setChecklistItemTiers,
} from "@/app/actions/checklists";

const TIER_LABEL: Record<string, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

export function ChecklistEditor({ checklist, sections }: { checklist: ChecklistRow; sections: ChecklistSection[] }) {
  const { pending, run } = useCatalogueAction();
  const inspection = checklist.kind === "inspection";
  const [newSection, setNewSection] = useState("");
  const [newSectionItem, setNewSectionItem] = useState("");

  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-3 p-4">
        <span className="text-sm font-semibold text-text-muted">Name</span>
        <InlineName
          value={checklist.name}
          pending={pending}
          onSave={(name) => run(() => renameChecklist({ id: checklist.id, name }), { success: "Renamed." })}
          className="text-base font-bold text-text-primary"
        />
      </Card>

      {sections.map((section) => (
        <SectionCard
          key={section.section}
          checklistId={checklist.id}
          inspection={inspection}
          section={section}
          pending={pending}
          run={run}
        />
      ))}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-bold text-text-primary">Add a section</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                addChecklistItem({
                  checklistId: checklist.id,
                  section: newSection,
                  label: newSectionItem,
                  tiers: inspection ? ["gold"] : null,
                }),
              {
                success: "Section added.",
                onSuccess: () => {
                  setNewSection("");
                  setNewSectionItem("");
                },
              },
            );
          }}
        >
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Section name"
            aria-label="New section name"
            className="h-10 flex-1 rounded-button border border-border bg-surface-card px-3 text-sm focus:border-brand-blue focus:outline-none"
          />
          <input
            value={newSectionItem}
            onChange={(e) => setNewSectionItem(e.target.value)}
            placeholder="Its first item"
            aria-label="First item of the new section"
            className="h-10 flex-1 rounded-button border border-border bg-surface-card px-3 text-sm focus:border-brand-blue focus:outline-none"
          />
          <Button type="submit" size="sm" iconLeft={Plus} disabled={pending || !newSection.trim() || !newSectionItem.trim()}>
            Add
          </Button>
        </form>
      </Card>
    </div>
  );
}

function SectionCard({
  checklistId,
  inspection,
  section,
  pending,
  run,
}: {
  checklistId: string;
  inspection: boolean;
  section: ChecklistSection;
  pending: boolean;
  run: ReturnType<typeof useCatalogueAction>["run"];
}) {
  const [newItem, setNewItem] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const hidden = section.items.filter((i) => !i.is_active);
  const visible = section.items.filter((i) => i.is_active || showHidden);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <InlineName
          value={section.section}
          pending={pending}
          onSave={(to) => run(() => renameChecklistSection({ checklistId, from: section.section, to }), { success: "Section renamed." })}
          className="text-sm font-bold text-text-primary"
        />
        <span className="text-xs text-text-muted">
          {section.items.filter((i) => i.is_active).length} items
          {hidden.length > 0 && (
            <button type="button" onClick={() => setShowHidden((s) => !s)} className="ml-2 font-semibold text-brand-blue hover:underline">
              {showHidden ? "hide" : "show"} {hidden.length} switched off
            </button>
          )}
        </span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {visible.map((item, index) => (
          <li key={item.id} className={cn("flex items-center gap-3 px-4 py-2.5", !item.is_active && "opacity-50")}>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                disabled={pending || index === 0}
                onClick={() => run(() => moveChecklistItem({ id: item.id, direction: "up" }))}
                className="inline-flex size-7 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-30"
                aria-label={`Move "${item.label}" up`}
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                disabled={pending || index === visible.length - 1}
                onClick={() => run(() => moveChecklistItem({ id: item.id, direction: "down" }))}
                className="inline-flex size-7 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-30"
                aria-label={`Move "${item.label}" down`}
              >
                <ArrowDown size={13} />
              </button>
            </div>
            <InlineName
              value={item.label}
              pending={pending}
              onSave={(label) => run(() => renameChecklistItem({ id: item.id, label }), { success: "Renamed." })}
              className="min-w-0 flex-1 text-sm text-text-primary"
            />
            {inspection && (
              <div className="flex shrink-0 gap-1">
                {CHECKLIST_TIERS.map((tier) => {
                  const on = item.tiers == null || item.tiers.includes(tier);
                  return (
                    <button
                      key={tier}
                      type="button"
                      disabled={pending || !item.is_active}
                      aria-pressed={on}
                      onClick={() => {
                        const current = item.tiers ?? [...CHECKLIST_TIERS];
                        const next = on ? current.filter((t) => t !== tier) : [...current, tier];
                        run(() => setChecklistItemTiers({ id: item.id, tiers: next }));
                      }}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        on ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-border text-text-muted",
                      )}
                    >
                      {TIER_LABEL[tier]}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => setChecklistItemActive({ id: item.id, isActive: !item.is_active }), {
                  success: item.is_active ? "Switched off." : "Switched back on.",
                })
              }
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary"
              aria-label={item.is_active ? `Switch off "${item.label}"` : `Switch on "${item.label}"`}
              title={item.is_active ? "Switch off" : "Switch back on"}
            >
              {item.is_active ? <EyeOff size={14} /> : <RotateCcw size={14} />}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t border-border bg-surface px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              addChecklistItem({
                checklistId,
                section: section.section,
                label: newItem,
                tiers: inspection ? ["gold"] : null,
              }),
            { success: "Item added.", onSuccess: () => setNewItem("") },
          );
        }}
      >
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={`Add an item to ${section.section}`}
          aria-label={`Add an item to ${section.section}`}
          className="h-9 flex-1 rounded-button border border-border bg-surface-card px-3 text-sm focus:border-brand-blue focus:outline-none"
        />
        <Button type="submit" size="sm" iconLeft={Plus} disabled={pending || !newItem.trim()}>
          Add
        </Button>
      </form>
    </Card>
  );
}
