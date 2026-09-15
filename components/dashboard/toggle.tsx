"use client";

import { cn } from "@/lib/utils";

// The mockups' blue on/off switch (44 × 26) for the customer dashboard. The
// admin's green `components/ui/switch.tsx` stays as it is. Presentational: the
// parent owns the state.

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name; there's no visible label inside the control. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[26px] w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
        checked ? "bg-brand-blue" : "bg-slate-300",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-[left]",
          checked ? "left-[20px]" : "left-0.5",
        )}
      />
    </button>
  );
}
