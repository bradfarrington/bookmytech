"use client";

import { cn } from "@/lib/utils";

// The admin pill switch, lifted from the SMS panel's enable toggle so every
// on/off control in the admin looks and behaves the same. Purely presentational:
// the parent owns the state (optimistic flip + revert on failure is the
// convention — see BalanceAndToggle in the SMS panel).

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — required, there is no visible label inside the control. */
  label: string;
  disabled?: boolean;
  /** `sm` fits a card header; the default matches the SMS panel. */
  size?: "sm" | "md";
  className?: string;
}

export function Switch({ checked, onChange, label, disabled, size = "md", className }: SwitchProps) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
        sm ? "h-5 w-9" : "h-7 w-12",
        checked ? "bg-success" : "bg-border",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block transform rounded-full bg-white shadow transition-transform",
          sm ? "size-3.5" : "size-5",
          checked ? (sm ? "translate-x-[18px]" : "translate-x-6") : "translate-x-1",
        )}
      />
    </button>
  );
}
