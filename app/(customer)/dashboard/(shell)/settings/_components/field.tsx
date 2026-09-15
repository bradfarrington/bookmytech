"use client";

import { useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Form fields for the Account screens (Task 48): the mockups' `.input` (44px
// tall, 8px radius, blue border and a soft ring on focus), a label above and
// help below.

export function Field({
  label,
  htmlFor,
  help,
  children,
  className,
}: {
  label: React.ReactNode;
  /** The input's id. The help line gets `${htmlFor}-help` for aria-describedby. */
  htmlFor: string;
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 text-xs font-semibold text-text-secondary">
        {label}
      </label>
      {children}
      {help && (
        <div id={`${htmlFor}-help`} aria-live="polite" className="mt-1.5 text-xs leading-4 text-text-muted">
          {help}
        </div>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
  icon?: LucideIcon;
  trailing?: React.ReactNode;
  invalid?: boolean;
  className?: string;
};

export function TextInput({ icon: Icon, trailing, invalid, className, disabled, ...rest }: InputProps) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2.5 rounded-lg border bg-surface-card px-3.5 transition-[border-color,box-shadow]",
        "focus-within:border-brand-blue focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.10)]",
        invalid ? "border-danger" : "border-border",
        disabled && "opacity-60",
        className,
      )}
    >
      {Icon && <Icon size={16} className="shrink-0 text-text-muted" aria-hidden />}
      <input
        disabled={disabled}
        aria-invalid={invalid || undefined}
        // 16px on a phone so iOS doesn't zoom into the field.
        className="h-full min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-slate-400 disabled:cursor-not-allowed sm:text-sm"
        {...rest}
      />
      {trailing}
    </div>
  );
}

/** A password input. `revealable` adds the show/hide eye. */
export function PasswordInput({
  revealable = false,
  ...rest
}: Omit<InputProps, "type" | "trailing"> & { revealable?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextInput
      {...rest}
      type={revealable && visible ? "text" : "password"}
      trailing={
        revealable ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-primary"
          >
            {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        ) : undefined
      }
    />
  );
}

/** A form's error sentence, announced when it appears. */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] leading-[19px] text-red-700"
    >
      {children}
    </div>
  );
}
