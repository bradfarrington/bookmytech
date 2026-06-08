"use client";

import { useEffect, useRef } from "react";
import { X, Car, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { VehicleDetails } from "@/lib/dvla/types";

export type VehicleLookupStatus = "loading" | "success" | "error";

export interface VehicleLookupModalProps {
  open: boolean;
  onClose: () => void;
  /** The reg the user submitted — echoed back inside the modal. */
  reg: string;
  postcode?: string;
  status: VehicleLookupStatus;
  details?: VehicleDetails;
  errorMessage?: string;
  onContinue?: () => void;
}

export function VehicleLookupModal({
  open,
  onClose,
  reg,
  postcode,
  status,
  details,
  errorMessage,
  onContinue,
}: VehicleLookupModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
        if (e.target === dialogRef.current) onClose();
      }}
      className={cn(
        "w-full max-w-md rounded-2xl border border-border bg-surface-card p-0 shadow-hero",
        "backdrop:bg-text-primary/50 backdrop:backdrop-blur-sm",
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
              {status === "loading" && "Looking up your vehicle"}
              {status === "success" && "We found your car"}
              {status === "error" && "Lookup failed"}
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

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <Icon
            icon={Loader2}
            size={28}
            className="animate-spin text-brand-blue"
          />
          <p className="text-sm text-text-secondary">
            Looking up your vehicle…
          </p>
        </div>
      )}

      {status === "success" && details && (
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xl font-bold text-text-primary">
              {[details.yearOfManufacture, details.make, details.model]
                .filter(Boolean)
                .join(" ")}
            </p>
            {details.colour && (
              <Pill tone="neutral">{titleCase(details.colour)}</Pill>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface p-4 text-sm">
            {details.fuelType && (
              <DetailRow label="Fuel" value={titleCase(details.fuelType)} />
            )}
            {typeof details.engineCapacity === "number" && (
              <DetailRow label="Engine" value={`${details.engineCapacity} cc`} />
            )}
            {details.motStatus && (
              <DetailRow
                label="MOT"
                value={details.motStatus}
                hint={
                  details.motExpiryDate
                    ? `until ${formatDate(details.motExpiryDate)}`
                    : undefined
                }
                tone={statusTone(details.motStatus)}
              />
            )}
            {details.taxStatus && (
              <DetailRow
                label="Tax"
                value={details.taxStatus}
                hint={
                  details.taxDueDate
                    ? `until ${formatDate(details.taxDueDate)}`
                    : undefined
                }
                tone={statusTone(details.taxStatus)}
              />
            )}
          </dl>

          <p className="text-[13px] text-text-muted">
            Not your car?{" "}
            <button
              type="button"
              onClick={onClose}
              className="font-semibold text-brand-blue hover:underline"
            >
              Try a different reg
            </button>
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-4 p-6">
          <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4">
            <Icon icon={AlertCircle} size={18} className="mt-0.5 text-red-600" />
            <p className="text-sm text-red-700">
              {errorMessage ?? "Something went wrong looking up your vehicle."}
            </p>
          </div>
          <p className="text-[13px] text-text-muted">
            Double-check the registration and try again.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border-subtle p-6">
        <Button variant="ghost" onClick={onClose}>
          {status === "success" ? "Close" : "Cancel"}
        </Button>
        {status === "success" && (
          <Button
            variant="primary"
            iconRight={ArrowRight}
            onClick={onContinue ?? onClose}
          >
            Continue to booking
          </Button>
        )}
      </div>
    </dialog>
  );
}

function DetailRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "error" | "pending" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        {label}
      </dt>
      <dd className="flex flex-wrap items-center gap-2">
        <Pill tone={tone ?? "neutral"}>{value}</Pill>
        {hint && <span className="text-[12px] text-text-muted">{hint}</span>}
      </dd>
    </div>
  );
}

function statusTone(status: string): "success" | "error" | "pending" | "neutral" {
  const lower = status.toLowerCase();
  if (lower.includes("valid") || lower.includes("taxed")) return "success";
  if (lower.includes("expired") || lower.includes("untaxed") || lower.includes("sorn")) return "error";
  if (lower.includes("due")) return "pending";
  return "neutral";
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
