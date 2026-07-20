"use client";

import Link from "next/link";
import { useState } from "react";
import { RotateCcw } from "lucide-react";

// One-tap rebook with a "same mechanic if available" preference (Task 11 Stage
// 1). When we know the repair node we deep-link straight to the price/match
// step with the vehicle + postcode pre-filled (skipping reg lookup / repair
// browse); otherwise (legacy service-era booking with no repair node) we fall
// back to the start of the booking flow. Ticking "same mechanic" threads
// ?pref=<mechanicId> through to /book/slot, which dispatchBooking uses to offer
// the job to that mechanic first.
export function RebookControl({
  reg,
  postcode,
  repairNodeId,
  make,
  model,
  mechanicId,
  mechanicName,
}: {
  reg: string;
  postcode: string | null;
  repairNodeId: string | null;
  make: string | null;
  model: string | null;
  mechanicId: string | null;
  mechanicName: string | null;
}) {
  const [sameMechanic, setSameMechanic] = useState(true);

  let href: string;
  if (repairNodeId) {
    const params = new URLSearchParams({ reg, repair: repairNodeId });
    if (postcode) params.set("postcode", postcode);
    if (make) params.set("make", make);
    if (model) params.set("model", model);
    if (mechanicId && sameMechanic) params.set("pref", mechanicId);
    href = `/book/match?${params.toString()}`;
  } else {
    href = `/book?reg=${encodeURIComponent(reg)}`;
  }

  const canPreferMechanic = Boolean(mechanicId && repairNodeId);

  return (
    <div className="flex flex-col gap-1.5">
      <Link
        href={href}
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-button border border-brand-blue px-3 text-sm font-medium text-brand-blue transition-colors hover:bg-blue-50"
      >
        <RotateCcw size={15} />
        Book again
      </Link>
      {canPreferMechanic && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={sameMechanic}
            onChange={(e) => setSameMechanic(e.target.checked)}
            className="size-3.5 rounded border-border text-brand-blue focus:ring-brand-blue/30"
          />
          Same mechanic if available
          {mechanicName ? ` (${mechanicName})` : ""}
        </label>
      )}
    </div>
  );
}
