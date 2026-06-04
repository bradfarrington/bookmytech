"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck, Wrench } from "lucide-react";
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
// and keeps that money). The choice re-prices their payout server-side.
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
        and we deliver the part — its cost comes off your payout instead.
      </p>
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
