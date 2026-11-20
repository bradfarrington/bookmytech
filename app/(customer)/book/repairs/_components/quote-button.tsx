"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquareText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// "Get a quote" on a repair whose parts NAPA doesn't list for this car
// (2026-11-17, Gareth: "have a message pop up with contact us for a manual
// quote"). Opens a short explanation, then the Task 75 quote request with the
// car and the repair filled in. Positive wording on purpose (Brad: no "we can't").

export function QuoteButton({ repairName, href }: { repairName: string; href: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-brand-blue px-3.5 py-2 text-sm font-bold text-brand-blue transition-colors hover:bg-blue-50"
      >
        Get a quote
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="quote-dialog-title"
        className={cn(
          "w-full max-w-md rounded-2xl border border-border bg-surface-card p-0 shadow-hero",
          "backdrop:bg-text-primary/50 backdrop:backdrop-blur-sm",
          "fixed inset-0 m-auto",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <Icon icon={MessageSquareText} size={20} className="text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 id="quote-dialog-title" className="text-lg font-bold text-text-primary">
                We&apos;ll price this one for you
              </h2>
              <p className="text-[13px] text-text-muted">{repairName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-button p-1 text-text-muted hover:bg-border-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
          >
            <Icon icon={X} size={20} />
          </button>
        </div>
        <p className="px-6 py-5 text-sm text-text-secondary">
          Our team prices the parts for this job on your car by hand. Send us a quick request
          and we&apos;ll email you a price.
        </p>
        <div className="flex items-center justify-end gap-3 border-t border-border-subtle p-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Link href={href}>
            <Button variant="primary" iconRight={ArrowRight}>
              Ask for a quote
            </Button>
          </Link>
        </div>
      </dialog>
    </>
  );
}
