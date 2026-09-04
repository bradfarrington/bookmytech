"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  setRepairVehicleAvailability,
  type ExclusionTarget,
} from "@/app/actions/vehicle-exclusions";

// "Show again" on the hidden-repairs review page (Task 23). Not the optimistic
// RepairToggle: in a list of hidden things a row that stays put with a ticked
// switch reads as "still hidden", so this refreshes the page and lets the row
// leave instead.

export function ShowAgainButton({
  target,
  nodeId,
  label,
}: {
  target: ExclusionTarget;
  nodeId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function show() {
    startTransition(async () => {
      const result = await setRepairVehicleAvailability({
        ...target,
        nodeId,
        available: true,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        target.scope === "global"
          ? `${label} is shown again for all vehicles.`
          : `${label} is shown again for this model.`,
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={show}
      disabled={pending}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue/40 hover:text-brand-blue",
        pending && "opacity-60",
      )}
    >
      <Eye size={13} />
      Show again
    </button>
  );
}
