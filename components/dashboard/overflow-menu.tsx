"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { EllipsisVertical, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The mockups' ⋮ on a garage or address card: a small panel anchored under the
// button. The parent owns what's inside (the options, or a rename form or a
// "remove this?" check in their place), so one panel serves every step.
// A disclosure, not an ARIA menu: it holds forms as well as options. Closes on
// Escape and on a press outside.

export function OverflowMenu({
  label,
  open,
  onOpenChange,
  children,
  className,
}: {
  /** Accessible name for the ⋮ button: "Options for Ford Focus". */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => onOpenChange(!open)}
        className="-mr-1.5 -mt-1 flex size-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-border-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        <EllipsisVertical size={18} aria-hidden />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-surface-card p-1 shadow-float"
        >
          {children}
        </div>
      )}
    </div>
  );
}

const ITEM =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** One option in the panel: a link with `href`, otherwise a button. */
export function MenuItem({
  icon: Icon,
  children,
  onClick,
  href,
  tone = "default",
  disabled,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  const classes = cn(
    ITEM,
    tone === "danger" ? "text-red-700 hover:bg-red-50" : "text-text-primary hover:bg-surface",
  );
  const body = (
    <>
      <Icon size={16} aria-hidden className={tone === "danger" ? "text-red-600" : "text-text-muted"} />
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {body}
    </button>
  );
}

/** The "are you sure?" step that replaces the options before anything is removed. */
export function ConfirmPanel({
  title,
  body,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 p-2.5">
      <div className="text-sm font-bold leading-5 text-text-primary">{title}</div>
      {body && <p className="text-xs leading-4 text-text-secondary">{body}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-2.5 py-2 text-xs leading-4 text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-danger px-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-[12.5px] font-bold text-text-secondary transition-colors hover:bg-border-subtle hover:text-text-primary disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
