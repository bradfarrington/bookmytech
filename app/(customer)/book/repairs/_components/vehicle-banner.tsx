"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { VehiclePicker } from "@/components/customer/vehicle-picker";

// "Repair times matched to your <car>" — and the way out when that car is wrong.
//
// This is the only place on the website where the customer sees the vehicle the
// PRICES are actually built from. The step before it shows DVLA's record, which
// is nearly always right at make-and-model level; what a registration can't pin
// down is the engine variant, and that is what the labour times key off. So a
// customer who is going to notice the mistake notices it here, on this line —
// which makes this where the correction has to live.

interface VehicleBannerProps {
  reg: string;
  description: string;
  /** DVLA's make, to seed the picker. */
  make?: string | null;
}

export function VehicleBanner({ reg, description, make }: VehicleBannerProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (open) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-card p-4 shadow-card">
        <div>
          <p className="text-sm font-bold text-text-primary">Choose your vehicle</p>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Pick the exact model and engine for{" "}
            <span className="font-semibold tracking-wide">{reg}</span>. Prices are the
            manufacturer&apos;s book times for that variant, so this changes what you pay.
          </p>
        </div>
        <VehiclePicker
          reg={reg}
          dvlaMake={make}
          onSaved={() => {
            setOpen(false);
            // The tree, every price on it and the quote at booking time all read
            // the same cache row this just rewrote — so a refresh re-prices the
            // whole page against the corrected vehicle.
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-blue-50/60 px-3.5 py-2.5 text-[13px] text-text-secondary">
      <Wrench size={14} className="shrink-0 text-brand-blue" />
      <span>
        Repair times matched to your <span className="font-semibold">{description}</span>
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-semibold text-brand-blue hover:underline"
      >
        Not your car?
      </button>
    </div>
  );
}
