"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIELD_ERROR } from "./field";

interface StepShellProps {
  title: string;
  intro?: string;
  /** Path of the previous step, or null on the first step. */
  backHref: string | null;
  /** Label for the forward button. */
  nextLabel?: string;
  /** Inline validation error to show above the buttons. */
  error?: string | null;
  /** Called when the forward button is pressed. */
  onNext: () => void;
  pending?: boolean;
  children: React.ReactNode;
}

// Common chrome for every wizard step: one white card holding the title, the
// fields, an error slot and the Back / Continue row. Keeps each step component
// focused on its fields. The title lives inside the card because the layout
// pulls the card up over its gradient band (Task 46).
export function StepShell({
  title,
  intro,
  backHref,
  nextLabel = "Continue",
  error,
  onNext,
  pending,
  children,
}: StepShellProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="overflow-hidden rounded-[24px] border border-border bg-white shadow-float"
    >
      <div className="border-b border-border-subtle px-5 py-6 sm:px-8 sm:py-7">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-text-primary sm:text-[28px]">
          {title}
        </h1>
        {intro && <p className="mt-1.5 text-[15px] leading-[1.55] text-text-secondary">{intro}</p>}
      </div>

      <div className="space-y-5 px-5 py-6 sm:px-8">{children}</div>

      <div className="space-y-4 border-t border-border-subtle bg-surface/70 px-5 py-5 sm:px-8">
        {error && (
          <p role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          {backHref ? (
            <Link href={backHref}>
              <Button type="button" variant="ghost" size="lg" disabled={pending} className="bg-white font-bold">
                Back
              </Button>
            </Link>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            iconRight={pending ? undefined : ArrowRight}
            disabled={pending}
            className="font-bold"
          >
            {pending ? "Saving…" : nextLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
