"use client";

import { useEffect, useRef } from "react";
import { X, Car, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

// Stage 3 ships the modal shell with a placeholder body. When the DVLA API key
// arrives, swap the placeholder for the real VehicleDetails render — no other
// changes needed.

export interface VehicleLookupModalProps {
  open: boolean;
  onClose: () => void;
  /** The reg the user submitted — echoed back inside the modal. */
  reg: string;
  postcode?: string;
}

export function VehicleLookupModal({
  open,
  onClose,
  reg,
  postcode,
}: VehicleLookupModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open/close via the native <dialog> API — we get focus trap, ESC-to-close,
  // and accessible modal semantics for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes; clicks
        // inside the content card bubble up from a child and don't match.
        if (e.target === dialogRef.current) onClose();
      }}
      className={cn(
        "w-full max-w-md rounded-2xl border border-border bg-surface-card p-0 shadow-hero",
        "backdrop:bg-text-primary/50 backdrop:backdrop-blur-sm",
        // Reset the browser default centring math so we don't fight it
        "fixed inset-0 m-auto",
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50">
            <Icon icon={Car} size={20} className="text-brand-blue" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              Looking up your vehicle
            </h2>
            <p className="text-[13px] text-text-muted">
              {reg}
              {postcode ? ` · ${postcode}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-button p-1 text-text-muted hover:bg-border-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
        >
          <Icon icon={X} size={20} />
        </button>
      </div>

      <div className="space-y-4 p-6">
        <Pill tone="pending" dot>
          DVLA integration pending
        </Pill>
        <p className="text-sm text-text-secondary">
          We&apos;re finalising our DVLA API access. Once the key lands, this pop-up
          will show the make, model, year, fuel type, MOT status and tax status for
          your plate — in under a second.
        </p>
        <div className="flex items-start gap-3 rounded-xl bg-surface p-4 text-[13px] text-text-secondary">
          <Icon icon={Wrench} size={16} className="mt-0.5 text-brand-blue" />
          <p>
            <span className="font-semibold text-text-primary">
              In the meantime,
            </span>{" "}
            you can still browse our services and pricing below — we&apos;ll be
            booking real jobs the moment the API switches on.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border-subtle p-6">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" onClick={onClose}>
          Browse services
        </Button>
      </div>
    </dialog>
  );
}
