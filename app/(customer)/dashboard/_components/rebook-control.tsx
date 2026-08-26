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
  children,
}: {
  reg: string;
  postcode: string | null;
  repairNodeId: string | null;
  make: string | null;
  model: string | null;
  mechanicId: string | null;
  mechanicName: string | null;
  /**
   * The card's other actions (raise / view dispute). They render on the SAME
   * row as "Book again", with the preference tickbox on its own line beneath
   * both. Previously the caller laid them out as siblings of this whole stack
   * with `items-end`, which aligned the dispute button to the bottom of the
   * stack — so it sat next to the tickbox rather than next to the button, and
   * read as though the tickbox belonged to it.
   */
  children?: React.ReactNode;
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
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href}
          className="inline-flex h-9 items-center gap-1.5 rounded-button border border-brand-blue px-3.5 text-sm font-semibold text-brand-blue transition-colors hover:bg-blue-50"
        >
          <RotateCcw size={15} />
          Book again
        </Link>
        {children}
      </div>
      {canPreferMechanic && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-text-secondary">
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
