"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

// Custom dropdown that replaces the browser-native `<select>` for parity with
// the rest of the design system. Generic over the value type so consumers get
// type-safe `onChange` callbacks. Handles open/close, click-outside, keyboard
// navigation (Arrow keys, Enter/Space, Escape), and basic ARIA.
//
// Per project memory: do NOT use native <select> elements in client UI — use
// this primitive instead.

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  id,
  ...rest
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (event: MouseEvent) => {
      if (
        !buttonRef.current?.contains(event.target as Node) &&
        !listRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Sync the highlighted option to the current value whenever we open
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  const commit = (option: SelectOption<T>) => {
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (
            !open &&
            (event.key === "ArrowDown" ||
              event.key === "Enter" ||
              event.key === " ")
          ) {
            event.preventDefault();
            setOpen(true);
            return;
          }
          if (open) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, options.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              const option = options[activeIndex];
              if (option) commit(option);
            }
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-button border border-border bg-surface-card px-3.5 text-left text-sm font-normal text-text-primary",
          "transition-colors focus:outline-none",
          open
            ? "border-brand-blue ring-2 ring-brand-blue/20"
            : "focus-visible:border-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        {...rest}
      >
        <span className={cn(!current && "text-text-muted")}>
          {current?.label ?? placeholder}
        </span>
        <Icon
          icon={ChevronDown}
          size={14}
          className={cn(
            "text-text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-button border border-border bg-surface-card py-1 shadow-card"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-blue-50 text-brand-blue"
                    : "text-text-primary hover:bg-border-subtle",
                  isSelected && "font-semibold",
                )}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <Icon
                    icon={Check}
                    size={14}
                    className="text-brand-blue"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
