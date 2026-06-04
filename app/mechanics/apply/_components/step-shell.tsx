"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
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

// Common chrome for every wizard step: a titled card, an error slot, and a
// Back / Continue button row. Keeps each step component focused on its fields.
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
      className="space-y-6"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-text-primary">{title}</h1>
        {intro && <p className="text-sm text-text-secondary">{intro}</p>}
      </div>

      <Card className="space-y-5 p-6">{children}</Card>

      {error && (
        <p role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {backHref ? (
          <Link href={backHref}>
            <Button type="button" variant="ghost" disabled={pending}>
              Back
            </Button>
          </Link>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : nextLabel}
        </Button>
      </div>
    </form>
  );
}
