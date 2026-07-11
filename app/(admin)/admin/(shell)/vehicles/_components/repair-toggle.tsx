"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setRepairVehicleAvailability } from "@/app/actions/vehicle-exclusions";

// Per-model repair availability switch (Task 16 Stage G follow-up). Works on
// both GROUPS and individual timed repairs: ON = shown in the customer
// "Repairs for your car" browser (the default), OFF writes an exclusion row.
// Hiding a group hides everything beneath it — customers can't drill in.

export function RepairToggle({
  makeName,
  modelName,
  nodeId,
  description,
  initialAvailable,
}: {
  makeName: string;
  modelName: string;
  nodeId: string;
  description?: string | null;
  initialAvailable: boolean;
}) {
  const [available, setAvailable] = useState(initialAvailable);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !available;
    setAvailable(next); // optimistic — reverted on failure
    startTransition(async () => {
      const result = await setRepairVehicleAvailability({
        makeName,
        modelName,
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
      title={available ? "Shown to customers" : "Hidden from customers"}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        available ? "bg-success" : "bg-border",
        pending && "opacity-60",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-white shadow transition-transform",
          available ? "translate-x-6" : "translate-x-1",
        )}
      />
      <span className="sr-only">
        {available ? "Shown to customers" : "Hidden from customers"}
      </span>
    </button>
  );
}
