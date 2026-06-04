"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PricingResult } from "@/app/actions/pricing";

// A click-to-edit numeric cell used across the pricing board. Values live in a
// domain unit (pence, or a rate decimal); `toInput` renders the editable string,
// `toDisplay` the read-only one, and `parse` turns the typed string back into
// the domain unit (or null when invalid). Saves on blur / Enter, reverts on
// Escape, and surfaces server errors via toast.

interface InlineNumberProps {
  /** Current value in domain units; null shows the placeholder. */
  value: number | null;
  toInput: (v: number) => string;
  toDisplay: (v: number | null) => string;
  parse: (raw: string) => number | null;
  onSave: (v: number | null) => Promise<PricingResult>;
  ariaLabel: string;
  /** Allow clearing to null (e.g. "inherit default"). */
  clearable?: boolean;
  placeholder?: string;
  className?: string;
}

export function InlineNumber({
  value,
  toInput,
  toDisplay,
  parse,
  onSave,
  ariaLabel,
  clearable = false,
  placeholder = "—",
  className,
}: InlineNumberProps) {
  const [current, setCurrent] = useState<number | null>(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync when the server re-renders with a fresh value.
  useEffect(() => setCurrent(value), [value]);

  function startEdit() {
    setDraft(current != null ? toInput(current) : "");
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    if (!editing) return;
    setEditing(false);
    const trimmed = draft.trim();

    let next: number | null;
    if (trimmed === "") {
      if (!clearable) return; // blank not allowed → keep current
      next = null;
    } else {
      const parsed = parse(trimmed);
      if (parsed == null) {
        toast.error("That doesn't look like a valid number.");
        return;
      }
      next = parsed;
    }

    if (next === current) return; // no change
    const prev = current;
    setCurrent(next); // optimistic
    startTransition(async () => {
      const res = await onSave(next);
      if (!res.ok) {
        setCurrent(prev); // revert
        toast.error(res.error);
      } else {
        toast.success("Saved.");
      }
    });
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        aria-label={ariaLabel}
        className={cn(
          "h-9 w-full rounded-button border border-brand-blue bg-surface-card px-2.5 text-sm tabular-nums text-text-primary outline-none ring-2 ring-brand-blue/20",
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={`Edit ${ariaLabel}`}
      className={cn(
        "h-9 w-full rounded-button border border-transparent px-2.5 text-left text-sm tabular-nums text-text-primary transition-colors hover:border-border hover:bg-surface",
        pending && "pointer-events-none opacity-50",
        current == null && "text-text-muted",
        className,
      )}
    >
      {current != null ? toDisplay(current) : placeholder}
    </button>
  );
}

interface InlineTextProps {
  value: string;
  display?: (v: string) => string;
  onSave: (v: string) => Promise<PricingResult>;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

/** Click-to-edit single-line text cell. Same save/revert UX as InlineNumber. */
export function InlineText({
  value,
  display,
  onSave,
  ariaLabel,
  placeholder = "—",
  className,
}: InlineTextProps) {
  const [current, setCurrent] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setCurrent(value), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    if (!editing) return;
    setEditing(false);
    const next = draft.trim();
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    startTransition(async () => {
      const res = await onSave(next);
      if (!res.ok) {
        setCurrent(prev);
        toast.error(res.error);
      } else {
        toast.success("Saved.");
      }
    });
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        aria-label={ariaLabel}
        className={cn(
          "h-9 w-full rounded-button border border-brand-blue bg-surface-card px-2.5 text-sm text-text-primary outline-none ring-2 ring-brand-blue/20",
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(current);
        setEditing(true);
      }}
      aria-label={`Edit ${ariaLabel}`}
      className={cn(
        "h-9 w-full truncate rounded-button border border-transparent px-2.5 text-left text-sm text-text-primary transition-colors hover:border-border hover:bg-surface",
        pending && "pointer-events-none opacity-50",
        !current && "text-text-muted",
        className,
      )}
    >
      {current ? (display ? display(current) : current) : placeholder}
    </button>
  );
}
