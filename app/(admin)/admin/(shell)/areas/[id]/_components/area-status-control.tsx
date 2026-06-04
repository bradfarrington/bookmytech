"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setAreaStatus } from "@/app/actions/areas";

const OPTIONS: { value: "active" | "planned" | "paused"; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
];

// Lifecycle control for one area. 'active' is the only status that prices
// bookings (it flips is_active too, server-side).
export function AreaStatusControl({
  areaId,
  status,
}: {
  areaId: string;
  status: string;
}) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();

  function choose(value: "active" | "planned" | "paused") {
    if (value === current) return;
    const prev = current;
    setCurrent(value); // optimistic
    startTransition(async () => {
      const res = await setAreaStatus(areaId, value);
      if (res?.error) {
        setCurrent(prev);
        toast.error(res.error);
      } else {
        toast.success(
          value === "active"
            ? "Area activated — now pricing bookings."
            : value === "paused"
              ? "Area paused — no new bookings priced here."
              : "Area set to planned.",
        );
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-card p-1" role="group" aria-label="Area status">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          disabled={pending}
          onClick={() => choose(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
            current === o.value
              ? "bg-brand-blue text-white"
              : "text-text-secondary hover:bg-surface hover:text-text-primary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
