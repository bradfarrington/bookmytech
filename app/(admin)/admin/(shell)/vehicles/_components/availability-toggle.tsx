"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setServiceVehicleAvailability } from "@/app/actions/vehicle-exclusions";

// Per-model service availability switch (Task 16 Stage D/E). ON = bookable on
// this model (the default for every vehicle); OFF writes an exclusion row that
// hides the service from the booking grid once the customer's reg resolves to
// this model.

export function AvailabilityToggle({
  serviceId,
  makeName,
  modelName,
  initialAvailable,
}: {
  serviceId: string;
  makeName: string;
  modelName: string;
  initialAvailable: boolean;
}) {
  const [available, setAvailable] = useState(initialAvailable);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !available;
    setAvailable(next); // optimistic — reverted on failure
    startTransition(async () => {
      const result = await setServiceVehicleAvailability({
        serviceId,
        makeName,
        modelName,
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
        {available ? "Available on this model" : "Hidden on this model"}
      </span>
    </button>
  );
}
