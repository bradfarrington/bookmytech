"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

// Searchable, free-text-capable select (autocomplete/combobox).
//
// Built for long lists (vehicle makes/models) where the native <select> and our
// click-only Select primitive don't scale. Type to filter; pick an option, or
// keep your own typed value — `allowCustom` means a make/model we don't carry in
// the catalogue still goes through as free text, so coverage gaps never block a
// booking. Keyboard: Arrow keys to move, Enter to commit, Escape to close.

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<string>;
  placeholder?: string;
  disabled?: boolean;
  /** Keep the typed value even when it isn't one of the options. Default true. */
  allowCustom?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Search…",
  disabled,
  allowCustom = true,
  className,
  id,
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;

  // Filter on the typed value. An exact match (case-insensitive) shows the full
  // list so the user can still browse siblings after selecting.
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    const exact = options.some((o) => o.toLowerCase() === q);
    if (exact) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [value, options]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const commit = (option: string) => {
    onChange(option);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-12 items-center gap-2 rounded-lg border bg-surface px-3 transition-colors",
          open
            ? "border-brand-blue bg-surface-card ring-2 ring-brand-blue/25"
            : "border-border",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          id={id}
          value={value}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              if (open && filtered[activeIndex]) {
                e.preventDefault();
                commit(filtered[activeIndex]);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          {...rest}
        />
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-180")}
        />
      </div>

      {open && !disabled && filtered.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-card py-1 shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filtered.map((option, index) => {
            const isSelected = option.toLowerCase() === value.trim().toLowerCase();
            const isActive = index === activeIndex;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  // Commit before the input's blur closes the list.
                  e.preventDefault();
                  commit(option);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                  isActive ? "bg-blue-50 text-brand-blue" : "text-text-primary hover:bg-border-subtle",
                  isSelected && "font-semibold",
                )}
              >
                <span>{option}</span>
                {isSelected && <Icon icon={Check} size={14} className="text-brand-blue" />}
              </button>
            );
          })}
        </div>
      )}

      {open && !disabled && allowCustom && filtered.length === 0 && value.trim() && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-muted shadow-card">
          Using “<span className="font-semibold text-text-primary">{value.trim()}</span>”
        </div>
      )}
    </div>
  );
}
