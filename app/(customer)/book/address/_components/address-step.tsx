"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronRight, Home, MapPin, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import {
  PARKING_OPTIONS,
  useAddressDraft,
  writeAddressDraft,
  type AddressDraft,
  type ParkingType,
} from "@/lib/bookings/address-draft";
import { addressOneLine, type AddressKind, type SavedAddress } from "@/lib/addresses/validate";
import { stepQuery, type BookingBaseParams, type BookingTimeParams } from "@/lib/bookings/step-params";

// Step 5 of the funnel (Task 47): where the car will be. Saved to
// sessionStorage for the Confirm step, never to the URL.
//
// A signed-in customer's saved addresses (Task 49) sit above the form. Picking
// one fills the form in, and they can still edit it before continuing. The
// draft is written exactly as before, so Confirm can't tell the difference.

const INPUT =
  "h-12 w-full rounded-xl border border-border bg-white px-3.5 text-[15px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

const KIND_ICON: Record<AddressKind, LucideIcon> = {
  home: Home,
  work: Briefcase,
  other: MapPin,
};

interface AddressStepProps {
  base: BookingBaseParams;
  time: BookingTimeParams;
  /** `contextKeyFor(base)`, computed on the server. */
  context: string;
  /** The signed-in customer's saved addresses, default first. Empty for guests. */
  savedAddresses?: SavedAddress[];
}

/** The step has one address field: a saved address's two lines go into it together. */
function addressFieldFor(address: SavedAddress): string {
  return [address.addressLine1, address.addressLine2].filter(Boolean).join(", ");
}

const compactPostcode = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/**
 * What to fill a fresh form with. The default address, except when the
 * customer already gave a postcode earlier in the flow: then only a saved
 * address at that postcode, so we never swap in an address somewhere else.
 */
function prefillFor(addresses: SavedAddress[], bookingPostcode: string | undefined): SavedAddress | null {
  const typed = bookingPostcode ? compactPostcode(bookingPostcode) : "";
  if (!typed) return addresses.find((a) => a.isDefault) ?? null;
  const here = addresses.filter((a) => compactPostcode(a.postcode) === typed);
  return here.find((a) => a.isDefault) ?? here[0] ?? null;
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
  savedAddresses = [],
}: AddressStepProps & { saved: AddressDraft | null }) {
  const router = useRouter();
  // An address already typed for this booking always wins over a saved one.
  const [prefill] = useState(() => (saved ? null : prefillFor(savedAddresses, base.postcode)));
  const [addressLine1, setAddressLine1] = useState(
    saved?.addressLine1 ?? (prefill ? addressFieldFor(prefill) : ""),
  );
  const [postcode, setPostcode] = useState(saved?.postcode ?? prefill?.postcode ?? base.postcode ?? "");
  const [parkingType, setParkingType] = useState<ParkingType>(
    saved?.parkingType ?? prefill?.parkingType ?? "driveway",
  );
  const [instructions, setInstructions] = useState(
    saved?.instructions ?? prefill?.specialInstructions ?? "",
  );

  const ready = addressLine1.trim().length > 3 && postcode.trim().length >= 5;

  // The card that matches what's in the form. Editing the address away from it
  // simply deselects it.
  const selectedId =
    savedAddresses.find(
      (a) =>
        addressFieldFor(a) === addressLine1.trim() &&
        compactPostcode(a.postcode) === compactPostcode(postcode),
    )?.id ?? null;

  function pickSavedAddress(address: SavedAddress) {
    setAddressLine1(addressFieldFor(address));
    setPostcode(address.postcode);
    setParkingType(address.parkingType ?? "driveway");
    setInstructions(address.specialInstructions ?? "");
  }

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
      {savedAddresses.length > 0 && (
        <section aria-labelledby="saved-addresses-heading">
          <h2
            id="saved-addresses-heading"
            className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted"
          >
            Saved addresses
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {savedAddresses.map((address) => {
              const active = address.id === selectedId;
              const Icon = KIND_ICON[address.kind];
              return (
                <button
                  key={address.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickSavedAddress(address)}
                  className={cn(
                    "flex min-w-0 items-start gap-3 rounded-2xl border p-4 text-left shadow-card transition-colors",
                    active
                      ? "border-brand-blue bg-blue-50 ring-1 ring-inset ring-brand-blue"
                      : "border-border bg-white hover:border-brand-blue/50",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl text-brand-blue",
                      active ? "bg-white" : "bg-blue-50",
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-[15px] font-semibold text-text-primary">
                        {address.label}
                      </span>
                      {address.isDefault && <Pill tone="active">Default</Pill>}
                    </span>
                    <span className="break-words text-[13px] text-text-secondary">
                      {addressOneLine(address)}
                    </span>
                  </span>
                  <Check
                    aria-hidden
                    size={18}
                    className={cn("mt-0.5 shrink-0 text-brand-blue", active ? "opacity-100" : "opacity-0")}
                  />
                </button>
              );
            })}
          </div>
        </section>
      )}

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
