"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { cn, normaliseReg } from "@/lib/utils";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";
import type { VehicleDetails } from "@/lib/dvla/types";
import {
  VehicleLookupModal,
  type VehicleLookupStatus,
} from "./vehicle-lookup-modal";

export interface RegLookupFormProps {
  /** Pre-fills the reg input (e.g. for the hero's example state). */
  defaultReg?: string;
  /** Pre-fills the postcode input. */
  defaultPostcode?: string;
  className?: string;
}

interface LookupState {
  reg: string;
  postcode: string;
  status: VehicleLookupStatus;
  details?: VehicleDetails;
  errorMessage?: string;
}

export function RegLookupForm({
  defaultReg = "",
  defaultPostcode = "",
  className,
}: RegLookupFormProps) {
  const [reg, setReg] = useState(defaultReg);
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    const normalised = normaliseReg(reg);
    if (!normalised) return;
    const trimmedPostcode = postcode.trim();
    setLookup({
      reg: normalised,
      postcode: trimmedPostcode,
      status: "loading",
    });
    startTransition(async () => {
      const result = await lookupVehicleAction(normalised);
      setLookup((current) => {
        // Guard against the user closing the modal / submitting a new reg
        // before the response lands.
        if (!current || current.reg !== normalised) return current;
        if (result.ok) {
          return { ...current, status: "success", details: result.details };
        }
        return { ...current, status: "error", errorMessage: result.message };
      });
    });
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className={cn(
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
        <label
          className={cn(
            "flex h-10 min-w-0 items-center gap-2 rounded-md border-[1.5px] border-border bg-surface px-3",
            "transition-colors focus-within:border-brand-blue focus-within:bg-surface-card focus-within:ring-2 focus-within:ring-brand-blue/25",
            "md:flex-1 md:border-0 md:bg-transparent md:px-2 md:focus-within:bg-transparent md:focus-within:ring-0",
          )}
        >
          <Icon
            icon={MapPin}
            size={16}
            className="shrink-0 text-text-muted"
            aria-hidden
          />
          <input
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            name="postcode"
            placeholder="Postcode"
            aria-label="Postcode"
            autoComplete="postal-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={8}
            className={cn(
              "h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-bold uppercase tracking-[0.04em] text-text-primary outline-none",
              "placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted",
            )}
          />
        </label>
        <Button type="submit" variant="primary" iconRight={ArrowRight}>
          Get a price
        </Button>
      </form>

      <VehicleLookupModal
        open={lookup !== null}
        onClose={() => setLookup(null)}
        reg={lookup?.reg ?? ""}
        postcode={lookup?.postcode}
        status={lookup?.status ?? "loading"}
        details={lookup?.details}
        errorMessage={lookup?.errorMessage}
        onContinue={() => {
          const r = lookup?.reg ?? "";
          const p = lookup?.postcode ?? "";
          const url = `/book/vehicle?reg=${encodeURIComponent(r)}${p ? `&postcode=${encodeURIComponent(p)}` : ""}`;
          router.push(url);
        }}
      />
    </>
  );
}
