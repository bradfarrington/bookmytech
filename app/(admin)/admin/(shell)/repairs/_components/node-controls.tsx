"use client";

import { useState } from "react";
import { FolderInput, Layers, Plus, Trash2 } from "lucide-react";
import { Select, type SelectOption } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addNodeToBundle,
  createBundle,
  createCatalogueGroup,
  deleteCatalogueGroup,
  moveCatalogueGroup,
  moveNode,
  renameCatalogueGroup,
  setNodeName,
} from "@/app/actions/repair-catalogue";
import { InlineName } from "./inline-name";
import { useCatalogueAction } from "./use-catalogue-action";

// The per-row controls on /admin/repairs (Task 26). Each one is a thin client
// wrapper around one server action; the tree itself is server-rendered and
// refreshes after every change.

/** Where a thing can be listed. `value` is a parent id: "root", a HaynesPro group id, or "g:<uuid>". */
export type Destination = SelectOption<string>;

/** An existing combined repair a job can be added to. `value` is the bundle uuid. */
export type BundleTarget = SelectOption<string>;

const KEEP = "__keep__";
const RESET = "__reset__";
const NEW = "__new__";

// --- HaynesPro node: rename -------------------------------------------------

export function NodeName({
  nodeId,
  kind,
  description,
  customName,
  className,
}: {
  nodeId: string;
  kind: "group" | "repair";
  /** HaynesPro's own name. */
  description: string | null;
  customName: string | null;
  className?: string;
}) {
  const { pending, run } = useCatalogueAction();
  return (
    <InlineName
      value={customName ?? description ?? nodeId}
      original={description}
      pending={pending}
      className={className}
      onSave={(name) => run(() => setNodeName({ nodeId, kind, description, name }), { success: "Renamed." })}
      onReset={() => run(() => setNodeName({ nodeId, kind, description, name: null }), { success: "HaynesPro's name is back." })}
    />
  );
}

// --- HaynesPro node: move ---------------------------------------------------

export function NodeMove({
  nodeId,
  kind,
  description,
  currentParent,
  destinations,
  className = "w-44",
}: {
  nodeId: string;
  kind: "group" | "repair";
  description: string | null;
  /** The override's parent, or null when it sits where HaynesPro lists it. */
  currentParent: string | null;
  destinations: Destination[];
  className?: string;
}) {
  const { pending, run } = useCatalogueAction();
  const options: SelectOption<string>[] = [
    { value: KEEP, label: "Move to…" },
    { value: RESET, label: "Where HaynesPro lists it" },
    ...destinations.filter((d) => d.value !== nodeId),
  ];
  return (
    <Select
      value={KEEP}
      onChange={(v) => {
        if (v === KEEP) return;
        const parentId = v === RESET ? null : v;
        if ((parentId ?? null) === currentParent) return;
        run(() => moveNode({ nodeId, kind, description, parentId }), { success: "Moved." });
      }}
      options={options}
      disabled={pending}
      aria-label="Move to"
      className={cn(className, pending && "opacity-60")}
    />
  );
}

// --- HaynesPro job: combine -------------------------------------------------

export function CombineControl({
  nodeId,
  description,
  parentId,
  bundleTargets,
}: {
  nodeId: string;
  description: string | null;
  /** Where a new combined repair made from this job is listed. */
  parentId: string;
  bundleTargets: BundleTarget[];
}) {
  const { pending, run } = useCatalogueAction();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [optionLabel, setOptionLabel] = useState("");

  if (creating) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createBundle({ name, parentId, optionLabel, nodeId }), {
            success: "Combined repair created — add its other jobs from its card or from their rows.",
            onSuccess: () => {
              setCreating(false);
              setName("");
              setOptionLabel("");
            },
          });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Combined repair name, e.g. Brake pads & discs"
          aria-label="Combined repair name"
          className="h-9 w-64 rounded-md border border-border bg-surface-card px-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
        <input
          value={optionLabel}
          onChange={(e) => setOptionLabel(e.target.value)}
          placeholder="Option, e.g. Front (optional)"
          aria-label="First option label"
          className="h-9 w-48 rounded-md border border-border bg-surface-card px-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-button bg-brand-blue px-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Layers size={14} />
          Create
        </button>
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="h-9 rounded-button px-2 text-sm text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </form>
    );
  }

  const options: SelectOption<string>[] = [
    { value: KEEP, label: "Combine…" },
    { value: NEW, label: "New combined repair from this job" },
    ...bundleTargets.map((t) => ({ value: t.value, label: `Add to: ${t.label}` })),
  ];
  return (
    <Select
      value={KEEP}
      onChange={(v) => {
        if (v === KEEP) return;
        if (v === NEW) {
          setCreating(true);
          return;
        }
        run(() => addNodeToBundle({ bundleId: v, nodeId }), {
          success: `Added "${description ?? nodeId}" to the combined repair.`,
        });
      }}
      options={options}
      disabled={pending}
      aria-label="Combine with"
      className={cn("w-44", pending && "opacity-60")}
    />
  );
}

// --- Our own categories -----------------------------------------------------

export function GroupName({ groupId, name, className }: { groupId: string; name: string; className?: string }) {
  const { pending, run } = useCatalogueAction();
  return (
    <InlineName
      value={name}
      pending={pending}
      className={className}
      onSave={(next) => run(() => renameCatalogueGroup({ id: groupId, name: next }), { success: "Renamed." })}
    />
  );
}

export function GroupMove({
  groupId,
  currentParent,
  destinations,
  className = "w-44",
}: {
  groupId: string;
  currentParent: string;
  destinations: Destination[];
  className?: string;
}) {
  const { pending, run } = useCatalogueAction();
  const self = `g:${groupId}`;
  const options: SelectOption<string>[] = [
    { value: KEEP, label: "Move to…" },
    ...destinations.filter((d) => d.value !== self),
  ];
  return (
    <Select
      value={KEEP}
      onChange={(v) => {
        if (v === KEEP || v === currentParent) return;
        run(() => moveCatalogueGroup({ id: groupId, parentId: v }), { success: "Moved." });
      }}
      options={options}
      disabled={pending}
      aria-label="Move category to"
      className={cn(className, pending && "opacity-60")}
    />
  );
}

export function GroupDelete({ groupId, name }: { groupId: string; name: string }) {
  const { pending, run } = useCatalogueAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete the category "${name}"? Anything in it goes back where it came from.`)) return;
        run(() => deleteCatalogueGroup({ id: groupId }), { success: "Category deleted." });
      }}
      aria-label={`Delete ${name}`}
      title="Delete category"
      className="rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
    >
      <Trash2 size={14} />
    </button>
  );
}

export function NewCategoryForm({ parentId }: { parentId: string }) {
  const { pending, run } = useCatalogueAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border bg-surface-card px-3 text-sm font-semibold text-text-primary hover:border-brand-blue/40 hover:text-brand-blue"
      >
        <Plus size={14} />
        New category
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createCatalogueGroup({ name, parentId }), {
          success: "Category created.",
          onSuccess: () => {
            setOpen(false);
            setName("");
          },
        });
      }}
      className="flex items-center gap-2"
    >
      <FolderInput size={16} className="shrink-0 text-text-muted" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name"
        aria-label="Category name"
        className="h-9 w-56 rounded-md border border-border bg-surface-card px-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="h-9 rounded-button bg-brand-blue px-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        Create
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-9 rounded-button px-2 text-sm text-text-muted hover:text-text-primary"
      >
        Cancel
      </button>
    </form>
  );
}
