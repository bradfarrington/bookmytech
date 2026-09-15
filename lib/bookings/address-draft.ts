import { useSyncExternalStore } from "react";

// The address typed on the booking funnel's Address step (Task 47), carried to
// the Confirm step. sessionStorage, not the URL: it's personal data, and the
// same tab with the same lifetime as a half-finished checkout is exactly right.
// Keyed by the booking's context (lib/bookings/step-params.ts `contextKeyFor`)
// so an address typed for one job is never replayed onto another.
//
// Client-only. The server has no storage, so `useAddressDraft` reports
// `undefined` there and on the first client render, then the stored value.

export type ParkingType = "driveway" | "street" | "car_park" | "other";

export const PARKING_OPTIONS: ReadonlyArray<{ value: ParkingType; label: string }> = [
  { value: "driveway", label: "Driveway" },
  { value: "street", label: "On the street" },
  { value: "car_park", label: "Car park" },
  { value: "other", label: "Other" },
];

export interface AddressDraft {
  context: string;
  addressLine1: string;
  postcode: string;
  parkingType: ParkingType;
  instructions: string;
}

const STORAGE_KEY = "bmt.booking-address";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// useSyncExternalStore needs a stable snapshot: re-parse only when the stored
// string actually changes.
let cachedRaw: string | null = null;
let cachedDraft: AddressDraft | null = null;

function parse(raw: string | null): AddressDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AddressDraft>;
    if (
      typeof value.context !== "string" ||
      typeof value.addressLine1 !== "string" ||
      typeof value.postcode !== "string"
    ) {
      return null;
    }
    const parking = PARKING_OPTIONS.some((option) => option.value === value.parkingType)
      ? (value.parkingType as ParkingType)
      : "driveway";
    return {
      context: value.context,
      addressLine1: value.addressLine1,
      postcode: value.postcode,
      parkingType: parking,
      instructions: typeof value.instructions === "string" ? value.instructions : "",
    };
  } catch {
    return null;
  }
}

function snapshot(): AddressDraft | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: behave as if nothing was saved.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedDraft = parse(raw);
  }
  return cachedDraft;
}

/** Save the address and tell every mounted reader. Never throws. */
export function writeAddressDraft(draft: AddressDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the Confirm step will send the customer back here.
  }
  listeners.forEach((listener) => listener());
}

/**
 * The saved address for this booking: `undefined` until the browser has been
 * read (server render and first paint), `null` when there's none for this
 * context, otherwise the draft.
 */
export function useAddressDraft(context: string): AddressDraft | null | undefined {
  const draft = useSyncExternalStore(subscribe, snapshot, () => undefined);
  if (draft === undefined) return undefined;
  return draft && draft.context === context ? draft : null;
}

/** "Driveway" etc. for a stored parking value. */
export function parkingLabel(value: string): string {
  return PARKING_OPTIONS.find((option) => option.value === value)?.label ?? "Other";
}
