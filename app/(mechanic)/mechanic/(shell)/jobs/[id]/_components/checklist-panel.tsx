"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INSPECTION_RESULTS,
  SERVICE_RESULTS,
  checklistProgress,
  type ChecklistResult,
} from "@/lib/checklists/checklists";
import type { LoadedChecklist } from "@/lib/checklists/load";
import { saveChecklistResult } from "@/app/actions/job-checklist";

// The checklist the mechanic fills in on the job (Task 32). One tap per item
// — Checked / N/A on a service, Pass / Advisory / Fail / Not checked on an
// inspection — saved on its own at once (optimistic, reverted on failure), and
// a note per item that saves on blur. Read-only before work begins and after
// the job completes; the customer sees the finished answers as their report.

interface ChecklistPanelProps {
  bookingId: string;
  checklists: LoadedChecklist[];
  /** Booking status: only `in_progress` can edit. */
  status: string;
}

type Answers = Record<string, { result: string; comment: string | null }>;

const TONE: Record<string, string> = {
  checked: "bg-green-50 text-success border-green-200",
  na: "bg-surface text-text-secondary border-border",
  pass: "bg-green-50 text-success border-green-200",
  advisory: "bg-amber-50 text-amber-700 border-amber-200",
  fail: "bg-red-50 text-red-700 border-red-200",
  not_checked: "bg-surface text-text-secondary border-border",
};

export function ChecklistPanel({ bookingId, checklists, status }: ChecklistPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editable = status === "in_progress";
  const [answers, setAnswers] = useState<Answers>(() => {
    const out: Answers = {};
    for (const list of checklists) for (const r of list.results) out[r.item_id] = { result: r.result, comment: r.comment ?? null };
    return out;
  });
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});

  function save(itemId: string, patch: { result?: ChecklistResult; comment?: string | null }) {
    const previous = answers[itemId];
    if (patch.result) setAnswers((a) => ({ ...a, [itemId]: { result: patch.result!, comment: a[itemId]?.comment ?? null } }));
    startTransition(async () => {
      const res = await saveChecklistResult({ bookingId, itemId, ...patch });
      if (!res.ok) {
        toast.error(res.error);
        setAnswers((a) => (previous ? { ...a, [itemId]: previous } : Object.fromEntries(Object.entries(a).filter(([k]) => k !== itemId))));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {!editable && status !== "completed" && (
        <p className="rounded-xl border border-border bg-surface px-3.5 py-3 text-sm text-text-secondary">
          You&apos;ll fill this in once you&apos;ve begun work. Every item needs an answer before the job can be completed.
        </p>
      )}
      {checklists.map((list) => {
        const results = list.items
          .filter((i) => answers[i.id])
          .map((i) => ({ item_id: i.id, result: answers[i.id].result, comment: answers[i.id].comment }));
        const progress = checklistProgress(list.items, results);
        const inspection = list.checklist.kind === "inspection";
        const options = inspection ? INSPECTION_RESULTS : SERVICE_RESULTS;
        const multiSection = list.sections.length > 1;
        return (
          <div key={list.checklist.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-text-primary">{list.name}</h3>
              <p className="text-xs font-semibold text-text-muted">
                {progress.answered} of {progress.total} done
                {inspection && progress.answered > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-700">{progress.advisory} advisory</span>
                    {" · "}
                    <span className="text-red-700">{progress.fail} fail</span>
                  </>
                )}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
              <div
                className="h-full rounded-full bg-brand-blue transition-all"
                style={{ width: `${progress.total ? Math.round((progress.answered / progress.total) * 100) : 0}%` }}
              />
            </div>

            {list.sections.map((section) => {
              const sectionProgress = checklistProgress(section.items, results);
              return (
                <details
                  key={section.section}
                  open={!multiSection || sectionProgress.unanswered > 0}
                  className="group rounded-xl border border-border bg-surface-card"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
                    <span className="text-sm font-semibold text-text-primary">{section.section}</span>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      {sectionProgress.answered}/{sectionProgress.total}
                      <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                    {section.items.map((item) => {
                      const answer = answers[item.id];
                      const noteOpen = openNotes[item.id] ?? Boolean(answer?.comment);
                      return (
                        <li key={item.id} className="space-y-2 px-3.5 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <p className="text-sm text-text-primary">{item.label}</p>
                            <div className="flex shrink-0 flex-wrap gap-1.5">
                              {options.map((option) => {
                                const active = answer?.result === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    disabled={!editable || pending}
                                    onClick={() => save(item.id, { result: option.value })}
                                    className={cn(
                                      "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-default",
                                      active ? TONE[option.value] : "border-border bg-surface-card text-text-muted",
                                      editable && !active && "hover:border-text-muted hover:text-text-primary",
                                      !editable && !active && "opacity-40",
                                    )}
                                    aria-pressed={active}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {noteOpen ? (
                            <textarea
                              defaultValue={answer?.comment ?? ""}
                              readOnly={!editable}
                              rows={2}
                              placeholder="Add a note for the customer…"
                              aria-label={`Note for ${item.label}`}
                              onBlur={(e) => {
                                const next = e.target.value.trim() || null;
                                if (!editable || next === (answer?.comment ?? null)) return;
                                if (!answer) {
                                  toast.error("Choose an answer for this item first.");
                                  return;
                                }
                                setAnswers((a) => ({ ...a, [item.id]: { ...a[item.id], comment: next } }));
                                save(item.id, { comment: next });
                              }}
                              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
                            />
                          ) : (
                            editable && (
                              <button
                                type="button"
                                onClick={() => setOpenNotes((o) => ({ ...o, [item.id]: true }))}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
                              >
                                <MessageSquareText size={12} />
                                Add a note
                              </button>
                            )
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
