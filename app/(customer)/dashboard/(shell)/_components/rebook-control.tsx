"use client";

import Link from "next/link";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/dashboard/ui";
import { rebookHref } from "../_home/booking-logic";

// One-tap rebook with a "same mechanic if available" preference (Task 11 Stage
// 1). Where it goes is `rebookHref` (shared with Home's "Book again" link): the
// match step with the vehicle and every repair filled in, or the start of the
// booking flow for a legacy booking. Ticking "same mechanic" adds
// ?pref=<mechanicId>, which dispatchBooking uses to offer the job to that
// mechanic first.
export function RebookControl({
  reg,
  postcode,
  repairNodeIds,
  make,
  model,
  mechanicId,
  mechanicName,
  children,
}: {
  reg: string;
  postcode: string | null;
  repairNodeIds: string[];
  make: string | null;
  model: string | null;
  mechanicId: string | null;
  mechanicName: string | null;
  /**
   * Other actions that sit on the SAME row as "Book again", with the
   * preference tickbox on its own line beneath both, so the tickbox can't read
   * as belonging to them.
   */
  children?: React.ReactNode;
}) {
  const [sameMechanic, setSameMechanic] = useState(true);

  const href = rebookHref(
    { vehicleReg: reg, postcode, repairNodeIds, vehicleMake: make, vehicleModel: model },
    mechanicId && sameMechanic ? mechanicId : null,
  );
  const canPreferMechanic = Boolean(mechanicId && repairNodeIds.length > 0);

  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href} className={buttonClass({ variant: "secondary", size: "md" })}>
          <RotateCcw size={16} strokeWidth={2.2} aria-hidden />
          Book again
        </Link>
        {children}
      </div>
      {canPreferMechanic && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs leading-4 text-text-secondary">
          <input
            type="checkbox"
            checked={sameMechanic}
            onChange={(e) => setSameMechanic(e.target.checked)}
            className="size-4 rounded border-border accent-brand-blue"
          />
          Same mechanic if available
          {mechanicName ? ` (${mechanicName})` : ""}
        </label>
      )}
    </div>
  );
}
