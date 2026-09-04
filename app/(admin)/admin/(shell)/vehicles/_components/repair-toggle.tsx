"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  setRepairVehicleAvailability,
  type ExclusionTarget,
} from "@/app/actions/vehicle-exclusions";

// Repair availability switch (Task 16 Stage G follow-up; scopes in Task 23).
// Works on both GROUPS and individual timed repairs. ON = shown to customers
// (the default); OFF writes a hide row. `target` says for whom: one model, or
// every vehicle. On a model page a node hidden for all vehicles can still be
// switched ON — that writes a per-model override, not a global change.
// Hiding a group hides everything beneath it — customers can't drill in.

export function RepairToggle({
  target,
  nodeId,
  description,
  initialAvailable,
}: {
  target: ExclusionTarget;
  nodeId: string;
  description?: string | null;
  initialAvailable: boolean;
}) {
  const [available, setAvailable] = useState(initialAvailable);
  const [pending, startTransition] = useTransition();
  const everyone = target.scope === "global";
  const title = available
    ? everyone
      ? "Shown to customers on every vehicle"
      : "Shown to customers"
    : everyone
      ? "Hidden for all vehicles"
      : "Hidden from customers";

  function toggle() {
    const next = !available;
    setAvailable(next); // optimistic — reverted on failure
    startTransition(async () => {
      const result = await setRepairVehicleAvailability({
        ...target,
        nodeId,
        description,
        available: next,
      });
      if (!result.ok) {
        setAvailable(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={available}
      onClick={toggle}
      disabled={pending}
      title={title}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
        available
          ? "border-success bg-success text-white"
          : "border-border bg-surface-card text-transparent hover:border-success/50",
        pending && "opacity-60",
      )}
    >
      <Check size={12} strokeWidth={3} />
      <span className="sr-only">{title}</span>
    </button>
  );
}
