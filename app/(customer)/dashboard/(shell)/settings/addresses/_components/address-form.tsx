"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, House, MapPin, type LucideIcon } from "lucide-react";
import { saveCustomerAddress } from "@/app/actions/customer-addresses";
import { Button, ButtonLink, Panel } from "@/components/dashboard/ui";
import { ADDRESS_KIND_OPTIONS, ADDRESS_LIMITS, type AddressKind, type SavedAddress } from "@/lib/addresses/validate";
import { PARKING_OPTIONS, type ParkingType } from "@/lib/bookings/address-draft";
import { cn } from "@/lib/utils";

// Add or edit a saved address (Task 48, Task 49). The fields and chips match
// the booking flow's Address step (app/(customer)/book/address). The server
// action runs lib/addresses/validate.ts and says which field is wrong.

const INPUT =
  "h-12 w-full rounded-xl border border-border bg-white px-3.5 text-[15px] font-normal text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

const LIST_HREF = "/dashboard/settings/addresses";

const KIND_ICONS: Record<AddressKind, LucideIcon> = { home: House, work: Briefcase, other: MapPin };

function chipClass(active: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
    active
      ? "border-brand-blue bg-blue-50 text-brand-blue-dark ring-1 ring-inset ring-brand-blue"
      : "border-border bg-white text-text-secondary hover:border-brand-blue/50",
  );
}

function Optional() {
  return <span className="font-normal text-text-muted">(optional)</span>;
}

export function AddressForm({ address, isFirst = false }: { address: SavedAddress | null; isFirst?: boolean }) {
  const router = useRouter();
  const ids = { label: useId(), note: useId(), line1: useId(), line2: useId(), postcode: useId(), instructions: useId() };
  const [label, setLabel] = useState(address?.label ?? "");
  const [kind, setKind] = useState<AddressKind>(address?.kind ?? "home");
  const [note, setNote] = useState(address?.note ?? "");
  const [addressLine1, setAddressLine1] = useState(address?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(address?.addressLine2 ?? "");
  const [postcode, setPostcode] = useState(address?.postcode ?? "");
  const [parkingType, setParkingType] = useState<ParkingType | null>(address ? address.parkingType : "driveway");
  const [instructions, setInstructions] = useState(address?.specialInstructions ?? "");
  const alreadyDefault = address?.isDefault ?? false;
  const [makeDefault, setMakeDefault] = useState(alreadyDefault);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function chooseKind(next: AddressKind) {
    // Fill the name in from the type while it's still empty or still one of the type names.
    const typeNames = ADDRESS_KIND_OPTIONS.map((option) => option.label);
    const trimmed = label.trim();
    const option = ADDRESS_KIND_OPTIONS.find((o) => o.value === next);
    if (option && next !== "other" && (!trimmed || typeNames.includes(trimmed))) setLabel(option.label);
    setKind(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveCustomerAddress(
        address?.id ?? null,
        {
          label,
          kind,
          note,
          addressLine1,
          addressLine2,
          postcode,
          parkingType: parkingType ?? "",
          specialInstructions: instructions,
        },
        makeDefault || isFirst,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(LIST_HREF);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Panel padding="lg" className="flex flex-col gap-5">
        <label htmlFor={ids.label} className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          Name
          <input
            id={ids.label}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={ADDRESS_LIMITS.label}
            placeholder="e.g. Home, Mum's"
            required
            className={INPUT}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-text-primary">Type</legend>
          <div className="flex flex-wrap gap-2">
            {ADDRESS_KIND_OPTIONS.map((option) => {
              const Icon = KIND_ICONS[option.value];
              const active = kind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseKind(option.value)}
                  className={chipClass(active)}
                >
                  <Icon size={15} aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label htmlFor={ids.note} className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          <span>
            Note <Optional />
          </span>
          <input
            id={ids.note}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={ADDRESS_LIMITS.note}
            placeholder="e.g. Weekends only"
            className={INPUT}
          />
        </label>

        <label htmlFor={ids.line1} className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          Address
          <input
            id={ids.line1}
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            maxLength={ADDRESS_LIMITS.line}
            placeholder="House number and street"
            autoComplete="address-line1"
            required
            className={INPUT}
          />
        </label>

        <label htmlFor={ids.line2} className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          <span>
            Address line 2 <Optional />
          </span>
          <input
            id={ids.line2}
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            maxLength={ADDRESS_LIMITS.line}
            placeholder="Flat, area or town"
            autoComplete="address-line2"
            className={INPUT}
          />
        </label>

        <label htmlFor={ids.postcode} className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          Postcode
          <input
            id={ids.postcode}
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            placeholder="Postcode"
            autoComplete="postal-code"
            autoCapitalize="characters"
            maxLength={8}
            required
            className={cn(
              INPUT,
              "font-bold uppercase tracking-[0.04em] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal",
            )}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-text-primary">Where will the car be parked?</legend>
          <div className="flex flex-wrap gap-2">
            {PARKING_OPTIONS.map((option) => {
              const active = parkingType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setParkingType(active ? null : option.value)}
                  className={chipClass(active)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label htmlFor={ids.instructions} className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          <span>
            Anything the mechanic should know? <Optional />
          </span>
          <textarea
            id={ids.instructions}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={ADDRESS_LIMITS.instructions}
            placeholder="e.g. ring the bell on arrival, the gate code is 1234"
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-white px-3.5 py-3 text-[15px] font-normal text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
          />
        </label>

        <label className="flex items-start gap-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={alreadyDefault || isFirst || makeDefault}
            disabled={alreadyDefault || isFirst}
            onChange={(e) => setMakeDefault(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded border-border accent-brand-blue disabled:opacity-60"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Make this my default</span>
            {(alreadyDefault || isFirst) && (
              <span className="text-xs leading-4 text-text-muted">
                {alreadyDefault ? "This is your default address." : "Your first address is your default."}
              </span>
            )}
          </span>
        </label>
      </Panel>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" size="lg" disabled={pending} className="sm:min-w-44">
          {pending ? "Saving…" : "Save address"}
        </Button>
        <ButtonLink href={LIST_HREF} variant="ghost" size="lg">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
