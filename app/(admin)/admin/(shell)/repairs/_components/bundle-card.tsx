"use client";

import { useState } from "react";
import { Check, Layers, Plus, Trash2, X } from "lucide-react";
import { Select, type SelectOption } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addBundleOption,
  deleteBundle,
  deleteBundleOption,
  moveBundle,
  removeNodeFromBundle,
  renameBundle,
  renameBundleOption,
  setBundleActive,
  setOptionJob,
} from "@/app/actions/repair-catalogue";
import { InlineName } from "./inline-name";
import { JobSearch } from "./job-search";
import { useCatalogueAction } from "./use-catalogue-action";
import type { Destination } from "./node-controls";

// One combined repair on /admin/repairs (Task 26): its name, whether customers
// see it, where it's listed, the POOL of jobs it holds (added once, from the
// search box here or a job's row in the tree), and its options — each a set
// of ticks over the pool. "Brake pads & discs": pool = front pads, front
// discs, rear pads, rear discs; Front ticks the first two, Rear the last two,
// All round ticks all four.

export interface BundleCardJob {
  nodeId: string;
  description: string;
  hours: number | null;
}

export interface BundleCardOption {
  id: string;
  label: string;
  /** The pool jobs this option includes. */
  nodeIds: string[];
}

export interface BundleCardProps {
  bundle: { id: string; name: string; parentId: string; isActive: boolean };
  jobs: BundleCardJob[];
  options: BundleCardOption[];
  destinations: Destination[];
  /** Read-only rendering (the model page) — no controls. */
  readOnly?: boolean;
}

const KEEP = "__keep__";

function hours(h: number | null): string {
  return h == null ? "—" : `${Number(h.toFixed(2))}h`;
}

function optionHours(option: BundleCardOption, jobs: BundleCardJob[]): number | null {
  let total = 0;
  for (const id of option.nodeIds) {
    const job = jobs.find((j) => j.nodeId === id);
    if (!job || job.hours == null) return null;
    total += job.hours;
  }
  return option.nodeIds.length ? Math.round(total * 100) / 100 : null;
}

export function BundleCard({ bundle, jobs, options, destinations, readOnly }: BundleCardProps) {
  const { pending, run } = useCatalogueAction();
  const [addingOption, setAddingOption] = useState(false);
  const [optionLabel, setOptionLabel] = useState("");

  const moveOptions: SelectOption<string>[] = [{ value: KEEP, label: "Move to…" }, ...destinations];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface-card shadow-card",
        !bundle.isActive && "opacity-70",
      )}
    >
      {/* Header: name, state, move / show / delete */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
          <Layers size={16} className="text-brand-blue" />
        </span>
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <p className="truncate text-sm font-semibold text-text-primary">{bundle.name}</p>
          ) : (
            <InlineName
              value={bundle.name}
              pending={pending}
              className="text-sm font-semibold text-text-primary"
              onSave={(name) => run(() => renameBundle({ id: bundle.id, name }), { success: "Renamed." })}
            />
          )}
          <p className="text-[11px] font-medium text-text-muted">
            Combined repair · {jobs.length} job{jobs.length === 1 ? "" : "s"}
            {options.length > 1 ? ` · ${options.length} options` : ""}
            {!bundle.isActive && " · hidden from customers"}
          </p>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={KEEP}
              onChange={(v) => {
                if (v === KEEP || v === bundle.parentId) return;
                run(() => moveBundle({ id: bundle.id, parentId: v }), { success: "Moved." });
              }}
              options={moveOptions}
              disabled={pending}
              aria-label="Move combined repair to"
              className="w-44"
            />
            <button
              type="button"
              role="switch"
              aria-checked={bundle.isActive}
              disabled={pending}
              onClick={() =>
                run(() => setBundleActive({ id: bundle.id, active: !bundle.isActive }), {
                  success: bundle.isActive ? "Hidden from customers." : "Shown to customers.",
                })
              }
              title={bundle.isActive ? "Shown to customers" : "Hidden from customers"}
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                bundle.isActive
                  ? "border-success bg-success text-white"
                  : "border-border bg-surface-card text-transparent hover:border-success/50",
              )}
            >
              <Check size={12} strokeWidth={3} />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Delete the combined repair "${bundle.name}"? The separate jobs stay as they are.`)) return;
                run(() => deleteBundle({ id: bundle.id }), { success: "Combined repair deleted." });
              }}
              aria-label={`Delete ${bundle.name}`}
              title="Delete combined repair"
              className="rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* The pool of jobs */}
      <div className="space-y-2.5 border-b border-border-subtle px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Jobs in this combined repair</p>
        {jobs.length === 0 ? (
          <p className="text-xs text-amber-700">No jobs yet — search below, or use &ldquo;Combine…&rdquo; on a job in the tree.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {jobs.map((job) => (
              <li
                key={job.nodeId}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-secondary"
              >
                <span>{job.description}</span>
                <span className="text-text-muted">{hours(job.hours)}</span>
                {!readOnly && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => removeNodeFromBundle({ bundleId: bundle.id, nodeId: job.nodeId }), {
                        success: "Job removed.",
                      })
                    }
                    aria-label={`Remove ${job.description}`}
                    className="rounded-full p-0.5 text-text-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <X size={11} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && <JobSearch bundleId={bundle.id} poolIds={jobs.map((j) => j.nodeId)} />}
      </div>

      {/* Options: ticks over the pool */}
      <div className="px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          What customers can book
          {!readOnly && options.length > 1 && (
            <span className="ml-1 font-normal normal-case tracking-normal">— tick the jobs each option includes</span>
          )}
        </p>
        <ul className="mt-2 space-y-3">
          {options.map((option) => {
            const total = optionHours(option, jobs);
            return (
              <li key={option.id} className="rounded-xl border border-border-subtle bg-surface px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {readOnly ? (
                    <p className="text-sm font-medium text-text-primary">
                      {options.length > 1 ? `${bundle.name} · ${option.label}` : bundle.name}
                    </p>
                  ) : (
                    <InlineName
                      value={option.label}
                      pending={pending}
                      className="text-sm font-medium text-text-primary"
                      onSave={(label) =>
                        run(() => renameBundleOption({ id: option.id, label }), { success: "Renamed." })
                      }
                    />
                  )}
                  <span className="text-xs text-text-muted">
                    {option.nodeIds.length === 0
                      ? "nothing ticked yet"
                      : `${option.nodeIds.length} job${option.nodeIds.length === 1 ? "" : "s"}${total != null ? ` · ${hours(total)} on the reference vehicle` : ""}`}
                  </span>
                  {!readOnly && options.length > 1 && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Remove the option "${option.label}"?`)) return;
                        run(() => deleteBundleOption({ id: option.id }), { success: "Option removed." });
                      }}
                      aria-label={`Remove option ${option.label}`}
                      className="ml-auto rounded p-0.5 text-text-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {jobs.length > 0 && (
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {jobs.map((job) => {
                      const included = option.nodeIds.includes(job.nodeId);
                      if (readOnly && !included) return null;
                      return (
                        <li key={job.nodeId}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm",
                              included ? "text-text-primary" : "text-text-muted",
                              readOnly && "cursor-default",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={included}
                              disabled={readOnly || pending}
                              onChange={(e) =>
                                run(() => setOptionJob({ optionId: option.id, nodeId: job.nodeId, included: e.target.checked }))
                              }
                              className="size-4 rounded border-border text-brand-blue focus:ring-brand-blue/30"
                            />
                            <span className="min-w-0 flex-1 truncate">{job.description}</span>
                            <span className="shrink-0 text-xs text-text-muted">{hours(job.hours)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {option.nodeIds.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Customers won&apos;t see this option until it has at least one job ticked.
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {!readOnly && (
          <div className="mt-3">
            {addingOption ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => addBundleOption({ bundleId: bundle.id, label: optionLabel }), {
                    success: "Option added — tick the jobs it includes.",
                    onSuccess: () => {
                      setAddingOption(false);
                      setOptionLabel("");
                    },
                  });
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={optionLabel}
                  onChange={(e) => setOptionLabel(e.target.value)}
                  placeholder="Option label, e.g. Rear"
                  aria-label="Option label"
                  className="h-9 w-48 rounded-md border border-border bg-surface-card px-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                />
                <button
                  type="submit"
                  disabled={pending || !optionLabel.trim()}
                  className="h-9 rounded-button bg-brand-blue px-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAddingOption(false)}
                  className="h-9 rounded-button px-2 text-sm text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingOption(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline"
              >
                <Plus size={12} />
                Add an option (e.g. Front / Rear / All round)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
