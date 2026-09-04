"use client";

import { useState } from "react";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

// A name with a pencil beside it. Click → input; Enter or the tick saves,
// Escape or the cross cancels. `onReset` (when given) offers "use HaynesPro's
// name" for a node the admin renamed.

export function InlineName({
  value,
  original,
  onSave,
  onReset,
  pending,
  className,
  inputClassName,
}: {
  value: string;
  /** HaynesPro's own name, shown as a hint when the admin's differs. */
  original?: string | null;
  onSave: (name: string) => void;
  onReset?: () => void;
  pending?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const renamed = original != null && original !== value;

  if (!editing) {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
        <span className="min-w-0 truncate" title={renamed ? `HaynesPro: ${original}` : undefined}>
          {value}
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          aria-label="Rename"
          title="Rename"
          className="shrink-0 rounded p-0.5 text-text-muted hover:bg-border-subtle hover:text-text-primary"
        >
          <Pencil size={12} />
        </button>
        {renamed && onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={pending}
            aria-label="Use HaynesPro's name"
            title={`Use HaynesPro's name: ${original}`}
            className="shrink-0 rounded p-0.5 text-text-muted hover:bg-border-subtle hover:text-text-primary"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </span>
    );
  }

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onSave(next);
  };

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label="New name"
        className={cn(
          "h-8 min-w-0 flex-1 rounded-md border border-brand-blue bg-surface-card px-2 text-sm text-text-primary outline-none ring-2 ring-brand-blue/20",
          inputClassName,
        )}
      />
      <button
        type="button"
        onClick={commit}
        aria-label="Save"
        className="shrink-0 rounded p-1 text-success hover:bg-green-50"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        aria-label="Cancel"
        className="shrink-0 rounded p-1 text-text-muted hover:bg-border-subtle"
      >
        <X size={14} />
      </button>
    </span>
  );
}
