"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { cn, normaliseReg } from "@/lib/utils";
import { VehicleLookupModal } from "./vehicle-lookup-modal";

// Two instances of this form live on the landing page (hero + final CTA).
// Both behave identically: collect reg + postcode, open the lookup modal.
// DVLA wiring lands in the next iteration — replace `setOpen(true)` with a
// call to a server action.

export interface RegLookupFormProps {
  /** Pre-fills the reg input (e.g. for the hero's example state). */
  defaultReg?: string;
  /** Pre-fills the postcode input. */
  defaultPostcode?: string;
  className?: string;
}

export function RegLookupForm({
  defaultReg = "",
  defaultPostcode = "",
  className,
}: RegLookupFormProps) {
  const [reg, setReg] = useState(defaultReg);
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [submitted, setSubmitted] = useState<{ reg: string; postcode: string } | null>(null);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const normalised = normaliseReg(reg);
          if (!normalised) return;
          setSubmitted({ reg: normalised, postcode: postcode.trim() });
        }}
        className={cn(
          // Mobile: stack everything. md+: plate + postcode + button on one row.
          "flex w-full flex-col gap-2.5 rounded-2xl border border-border bg-surface-card p-3.5 shadow-card md:flex-row md:items-center",
          className,
        )}
      >
        <RegPlateInput
          value={reg}
          onChange={(e) => setReg(e.target.value)}
          name="reg"
          required
          aria-label="Vehicle registration"
        />
        <input
          type="text"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          name="postcode"
          placeholder="Your postcode"
          aria-label="Postcode"
          autoComplete="postal-code"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 md:border-0 md:bg-transparent md:focus:ring-0"
        />
        <Button type="submit" variant="primary" iconRight={ArrowRight}>
          Get a price
        </Button>
      </form>

      <VehicleLookupModal
        open={submitted !== null}
        onClose={() => setSubmitted(null)}
        reg={submitted?.reg ?? ""}
        postcode={submitted?.postcode}
      />
    </>
  );
}

