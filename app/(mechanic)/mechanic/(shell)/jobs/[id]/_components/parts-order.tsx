"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Truck, Wrench } from "lucide-react";
import { fitOptionsHeading, isChargedOption } from "@/lib/parts/fit-options";
import type { FitOptions } from "@/lib/parts/repair-part-choice";
import { cn, formatPrice } from "@/lib/utils";
import { setPartSourcing } from "@/app/actions/booking-parts";

export interface JobPart {
  id: string;
  name: string;
  quantity: number;
  unitPricePence: number;
  totalPence: number;
  sourcing: "self" | "bmt";
  status: string;
  /** "catalogue" for a supplier part priced into the booking (Task 43). */
  source?: "manual" | "catalogue";
  /** The exact part to buy, when the booking priced one. */
  supplierPartNumber?: string | null;
  brand?: string | null;
  /** The price was estimated for this car, not taken from a listed part (Task 72). */
  estimated?: boolean;
  /** Task 87: the versions for cars with / without air-con or stop-start, when NAPA lists them. */
  fitOptions?: FitOptions | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  ordered: "Ordered",
  delivered: "Delivered",
  used: "Fitted",
  returned: "Returned",
};

// Per-job parts list. The mechanic chooses, per line, whether to source the
// part themselves (keep the parts money) or order it via BMT (BMT supplies it
// and keeps that money). The choice re-prices their payout server-side. A part
// the customer's price included (Task 43) names the exact Alliance Automotive
// part it was priced as, so the mechanic buys the same one.
export function PartsOrder({
  parts,
  canEdit,
}: {
  parts: JobPart[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(parts);
  const [pending, startTransition] = useTransition();

  function choose(id: string, sourcing: "self" | "bmt") {
    const row = rows.find((r) => r.id === id);
    if (!row || row.sourcing === sourcing) return;
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, sourcing } : r))); // optimistic
    startTransition(async () => {
      const res = await setPartSourcing(id, sourcing);
      if (!res.ok) {
        setRows(prev);
        toast.error(res.error);
      } else {
        toast.success(sourcing === "bmt" ? "Ordered via BMT." : "You'll source this part.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/60 rounded-button border border-border">
        {rows.map((p) => (
          <li key={p.id} className="space-y-2 px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-text-primary">
                  {p.name}
                  {p.quantity > 1 && <span className="ml-1 text-text-muted">× {p.quantity}</span>}
                </span>
                {p.source === "catalogue" && (
                  <p className="mt-0.5 text-xs text-text-muted">
                    {p.estimated ? (
                      "Estimated price: buy a suitable part. If it costs more, send the customer a quote for the difference."
                    ) : p.supplierPartNumber ? (
                      <>
                        Priced as NAPA Auto Parts{p.brand ? ` · ${p.brand}` : ""} ·{" "}
                        <span className="font-mono">{p.supplierPartNumber}</span>
                      </>
                    ) : (
                      "Set price: NAPA Auto Parts had no price, so buy a suitable part"
                    )}
                  </p>
                )}
                {p.fitOptions && <FitOptionsBox fit={p.fitOptions} charged={p.supplierPartNumber} />}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                {formatPrice(p.totalPence)}
              </span>
            </div>

            {canEdit ? (
              <div className="flex items-center gap-2">
                <SourceButton
                  active={p.sourcing === "self"}
                  disabled={pending}
                  icon={Wrench}
                  label="I'll source it"
                  onClick={() => choose(p.id, "self")}
                />
                <SourceButton
                  active={p.sourcing === "bmt"}
                  disabled={pending}
                  icon={Truck}
                  label="Order via BMT"
                  onClick={() => choose(p.id, "bmt")}
                />
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                {p.sourcing === "bmt" ? "Ordered via BMT" : "Self-sourced"} ·{" "}
                {STATUS_LABEL[p.status] ?? p.status}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">
        Parts you source yourself are reimbursed in your payout. Order via BMT
        and we deliver the part; its cost comes off your payout instead.
      </p>
    </div>
  );
}

/**
 * Task 87: NAPA lists this part in versions for cars with and without air-con
 * (or stop-start). Which one the car takes, and what the customer said.
 */
function FitOptionsBox({ fit, charged }: { fit: FitOptions; charged?: string | null }) {
  const unsure = fit.dependsOn.some((key) => fit.answered?.[key] === undefined);
  return (
    <div
      className={cn(
        "mt-2 rounded-button border px-3 py-2 text-xs",
        unsure ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-surface text-text-secondary",
      )}
    >
      <p className="flex items-start gap-1.5 font-semibold">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
        {fitOptionsHeading(fit)}
      </p>
      <ul className="mt-1.5 space-y-1">
        {fit.options.map((o) => (
          <li key={`${o.partNumber}:${o.label}`} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-medium">{o.label}:</span>
            <span>{o.brand ?? "NAPA Auto Parts"}</span>
            <span className="font-mono">{o.partNumber}</span>
            {isChargedOption(o, charged) && <span className="text-text-muted">(priced as)</span>}
          </li>
        ))}
      </ul>
      {unsure && <p className="mt-1.5">Ask the customer in the chat, or check on arrival.</p>}
    </div>
  );
}

function SourceButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: typeof Wrench;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-button border px-2.5 py-2 text-xs font-semibold transition-colors",
        active
          ? "border-brand-blue bg-brand-blue text-white"
          : "border-border bg-surface-card text-text-secondary hover:border-brand-blue/40",
        disabled && "opacity-60",
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
