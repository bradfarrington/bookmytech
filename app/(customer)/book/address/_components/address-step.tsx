"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PARKING_OPTIONS,
  useAddressDraft,
  writeAddressDraft,
  type AddressDraft,
  type ParkingType,
} from "@/lib/bookings/address-draft";
import { stepQuery, type BookingBaseParams, type BookingTimeParams } from "@/lib/bookings/step-params";

// Step 5 of the funnel (Task 47): where the car will be. Saved to
// sessionStorage for the Confirm step, never to the URL.

const INPUT =
  "h-12 w-full rounded-xl border border-border bg-white px-3.5 text-[15px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

interface AddressStepProps {
  base: BookingBaseParams;
  time: BookingTimeParams;
  /** `contextKeyFor(base)`, computed on the server. */
  context: string;
}

export function AddressStep(props: AddressStepProps) {
  const saved = useAddressDraft(props.context);
  // Wait for the browser's saved copy before mounting the form, so the fields
  // start from it rather than being filled in afterwards.
  if (saved === undefined) {
    return <div aria-hidden className="h-[420px] animate-pulse rounded-[20px] bg-white/70" />;
  }
  return <AddressForm {...props} saved={saved} />;
}

function AddressForm({
  base,
  time,
  context,
  saved,
}: AddressStepProps & { saved: AddressDraft | null }) {
  const router = useRouter();
  const [addressLine1, setAddressLine1] = useState(saved?.addressLine1 ?? "");
  const [postcode, setPostcode] = useState(saved?.postcode ?? base.postcode ?? "");
  const [parkingType, setParkingType] = useState<ParkingType>(saved?.parkingType ?? "driveway");
  const [instructions, setInstructions] = useState(saved?.instructions ?? "");

  const ready = addressLine1.trim().length > 3 && postcode.trim().length >= 5;

  function handleContinue() {
    if (!ready) return;
    const cleanPostcode = postcode.trim().toUpperCase();
    writeAddressDraft({
      context,
      addressLine1: addressLine1.trim(),
      postcode: cleanPostcode,
      parkingType,
      instructions: instructions.trim(),
    });
    router.push(`/book/slot?${stepQuery({ ...base, postcode: cleanPostcode }, time)}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-5 rounded-[20px] border border-border bg-white p-5 shadow-card sm:p-6">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          Address
          <input
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="House number and street"
            autoComplete="address-line1"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          Postcode
          <input
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            placeholder="Postcode"
            autoComplete="postal-code"
            autoCapitalize="characters"
            maxLength={8}
            className={cn(INPUT, "font-bold uppercase tracking-[0.04em] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal")}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-text-primary">
            Where will the car be parked?
          </legend>
          <div className="flex flex-wrap gap-2">
            {PARKING_OPTIONS.map((option) => {
              const active = parkingType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setParkingType(option.value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "border-brand-blue bg-blue-50 text-brand-blue-dark ring-1 ring-inset ring-brand-blue"
                      : "border-border bg-white text-text-secondary hover:border-brand-blue/50",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          <span>
            Anything the mechanic should know?{" "}
            <span className="font-normal text-text-muted">(optional)</span>
          </span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. ring the bell on arrival, the gate code is 1234"
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-white px-3.5 py-3 text-[15px] font-normal text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
          />
        </label>
      </div>

      <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-white p-4 shadow-float">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!ready}
          iconRight={ChevronRight}
          className="font-bold"
        >
          Review booking
        </Button>
        <p className="mt-2 text-center text-[12px] text-text-muted">
          We share your address with the mechanic who takes your job.
        </p>
      </div>
    </form>
  );
}
